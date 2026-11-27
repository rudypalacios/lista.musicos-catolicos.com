<?php

declare(strict_types=1);

namespace Tests\Http;

use App\Auth\Authenticator;
use App\Auth\Google\GoogleFailed;
use App\Auth\Google\GoogleIdentity;
use App\Config;
use App\Database\Query;
use App\Http\AppFactory;
use App\Http\Actions\GoogleCallbackAction;
use App\Http\Actions\GoogleStartAction;
use App\Http\OAuthCookie;
use App\Http\SessionCookie;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Tests\Support\FakeGoogleOAuth;
use Tests\Support\RecordingMailer;
use Tests\Support\TestDatabase;

/** Signing in with Google, through the whole API: the browser is sent to Google, comes back, and ends in the app */
final class GoogleApiTest extends TestCase
{
    private const SITE = 'https://lista.example.org';

    private PDO $pdo;
    private FakeGoogleOAuth $google;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->google = new FakeGoogleOAuth();
        $this->google->identity = new GoogleIdentity('sub-1', 'ana@gmail.com');
        $this->app = $this->appWith($this->google);
    }

    /** @return App<\Psr\Container\ContainerInterface|null> */
    private function appWith(?FakeGoogleOAuth $google): App
    {
        $env = [
            'DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production', 'APP_URL' => self::SITE . '/',
        ];

        return AppFactory::create(
            $this->pdo,
            Config::fromEnv($env, '/app'),
            TestDatabase::MIGRATIONS,
            new RecordingMailer(),
            $google
        );
    }

    /** @param array<string, string> $cookies */
    private function get(string $uri, array $cookies = [], string $ip = '5.5.5.5'): ResponseInterface
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest('GET', 'https://lista.test' . $uri, ['REMOTE_ADDR' => $ip]);

        return $this->app->handle($request->withCookieParams($cookies));
    }

    /** The value of a cookie a response sets, or null */
    private function setCookie(ResponseInterface $response, string $name): ?string
    {
        foreach ($response->getHeader('Set-Cookie') as $header) {
            if (str_starts_with($header, $name . '=')) {
                return explode(';', substr($header, strlen($name) + 1))[0];
            }
        }

        return null;
    }

    /** @return array{state: string, binding: string} a sign-in started, as the browser does */
    private function start(): array
    {
        $response = $this->get('/api/google/start');
        $this->assertSame(302, $response->getStatusCode());
        $binding = $this->setCookie($response, OAuthCookie::NAME);
        $this->assertNotNull($binding);
        $authorization = $this->google->authorizations[array_key_last($this->google->authorizations)];

        return ['state' => $authorization['state'], 'binding' => $binding];
    }

    private function comeBack(string $query, string $binding): ResponseInterface
    {
        return $this->get('/api/google/callback?' . $query, [OAuthCookie::NAME => $binding]);
    }

    public function testTheButtonIsOfferedOnlyWhenGoogleIsSetUp(): void
    {
        $on = json_decode((string) $this->get('/api/auth-options')->getBody(), true);
        $this->assertSame(['google' => true], $on);

        $this->app = $this->appWith(null);
        $off = json_decode((string) $this->get('/api/auth-options')->getBody(), true);
        $this->assertSame(['google' => false], $off);
    }

    public function testStartSendsTheBrowserToGoogleWithACookieOnlyTheseRoutesReceive(): void
    {
        $response = $this->get('/api/google/start');

        $this->assertSame(302, $response->getStatusCode());
        $this->assertStringStartsWith('https://google.test/auth?state=', $response->getHeaderLine('Location'));
        $this->assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        $cookie = implode(';', $response->getHeader('Set-Cookie'));
        $this->assertStringContainsString('Path=/api/google', $cookie);
        $this->assertStringContainsString('HttpOnly', $cookie);
        $this->assertStringContainsString('SameSite=Lax', $cookie);
        $this->assertStringContainsString('Secure', $cookie);
        $this->assertStringContainsString('Max-Age=600', $cookie);
    }

    public function testTheChallengeSentToGoogleIsTheHashOfTheVerifierKeptHere(): void
    {
        $this->start();

        $sent = $this->google->authorizations[0];
        $kept = (string) Query::scalar($this->pdo, 'SELECT verifier FROM oauth_states');
        $expected = rtrim(strtr(base64_encode(hash('sha256', $kept, true)), '+/', '-_'), '=');
        $this->assertSame($expected, $sent['challenge']);
    }

    public function testComingBackMakesTheAccountAndOpensTheSession(): void
    {
        $started = $this->start();

        $response = $this->comeBack('code=the-code&state=' . $started['state'], $started['binding']);

        $this->assertSame(302, $response->getStatusCode());
        $this->assertSame(self::SITE . '/?google=new', $response->getHeaderLine('Location'));
        $token = $this->setCookie($response, SessionCookie::NAME);
        $this->assertNotNull($token);
        $this->assertSame('', $this->setCookie($response, OAuthCookie::NAME), 'the cookie of the sign-in is cleared');
        $this->assertSame('the-code', $this->google->exchanges[0]['code']);
        $this->assertSame($this->google->authorizations[0]['nonce'], $this->google->exchanges[0]['nonce']);

        $me = $this->get('/api/me', [SessionCookie::NAME => $token]);
        $this->assertSame(200, $me->getStatusCode());
        $this->assertSame('ana@gmail.com', json_decode((string) $me->getBody(), true)['email']);
    }

    public function testTheNextTimeItIsOkAndNotNew(): void
    {
        $first = $this->start();
        $this->comeBack('code=a&state=' . $first['state'], $first['binding']);

        $second = $this->start();
        $response = $this->comeBack('code=b&state=' . $second['state'], $second['binding']);

        $this->assertSame(self::SITE . '/?google=ok', $response->getHeaderLine('Location'));
    }

    public function testTheOwnersAccountIsFoundByItsConfirmedAddress(): void
    {
        (new Authenticator($this->pdo))->seedOwner('ana@gmail.com', 'correct horse', null);
        $started = $this->start();

        $response = $this->comeBack('code=c&state=' . $started['state'], $started['binding']);

        $this->assertSame(self::SITE . '/?google=ok', $response->getHeaderLine('Location'));
        $this->assertSame(1, (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM users'));
    }

    public function testAReturnWithoutTheBrowsersCookieSignsNobodyIn(): void
    {
        // Someone else started it and sent this link to the person: login CSRF
        $started = $this->start();

        $response = $this->get('/api/google/callback?code=c&state=' . $started['state']);

        $this->assertSame(self::SITE . '/?google=failed', $response->getHeaderLine('Location'));
        $this->assertNull($this->setCookie($response, SessionCookie::NAME));
        $this->assertSame([], $this->google->exchanges, 'Google was not even asked');
    }

    public function testAReturnWithAnotherBrowsersCookieSignsNobodyIn(): void
    {
        $started = $this->start();

        $response = $this->comeBack('code=c&state=' . $started['state'], str_repeat('a', 64));

        $this->assertSame(self::SITE . '/?google=failed', $response->getHeaderLine('Location'));
        $this->assertNull($this->setCookie($response, SessionCookie::NAME));
    }

    public function testAStateWorksOnce(): void
    {
        $started = $this->start();
        $this->comeBack('code=c&state=' . $started['state'], $started['binding']);

        $again = $this->comeBack('code=c&state=' . $started['state'], $started['binding']);

        $this->assertSame(self::SITE . '/?google=failed', $again->getHeaderLine('Location'));
    }

    public function testSayingNoToGoogleIsNotAnError(): void
    {
        $started = $this->start();

        $response = $this->comeBack('error=access_denied&state=' . $started['state'], $started['binding']);

        $this->assertSame(self::SITE . '/?google=cancelled', $response->getHeaderLine('Location'));
        $this->assertNull($this->setCookie($response, SessionCookie::NAME));
    }

    public function testAnAddressGoogleHasNotConfirmedIsToldApart(): void
    {
        $this->google->failure = new GoogleFailed('no', GoogleFailed::UNVERIFIED);
        $started = $this->start();

        $response = $this->comeBack('code=c&state=' . $started['state'], $started['binding']);

        $this->assertSame(self::SITE . '/?google=unverified', $response->getHeaderLine('Location'));
        $this->assertSame(0, (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM users'));
    }

    public function testAnythingElseThatGoesWrongIsOneWordAndNothingLeaks(): void
    {
        $this->google->failure = new GoogleFailed('Google refused the code (400): invalid_grant');
        $started = $this->start();

        $response = $this->comeBack('code=c&state=' . $started['state'], $started['binding']);

        $this->assertSame(self::SITE . '/?google=failed', $response->getHeaderLine('Location'));
        $this->assertStringNotContainsString('invalid_grant', (string) $response->getBody());
    }

    public function testWithoutGoogleSetUpBothRoutesSendTheBrowserBackWithAWord(): void
    {
        $this->app = $this->appWith(null);

        $this->assertSame(self::SITE . '/?google=unavailable', $this->get('/api/google/start')->getHeaderLine('Location'));
        $this->assertSame(
            self::SITE . '/?google=unavailable',
            $this->get('/api/google/callback?code=c&state=s')->getHeaderLine('Location')
        );
    }

    public function testTheReturnAddressIsTheSitesOwnNeverTheRequestsHost(): void
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest('GET', 'https://evil.test/api/google/callback')
            ->withHeader('Host', 'evil.test');

        $response = $this->app->handle($request);

        $this->assertStringStartsWith(self::SITE . '/', $response->getHeaderLine('Location'));
    }

    public function testTooManyStartsFromOneAddressAreSentBackBusy(): void
    {
        for ($i = 0; $i < GoogleStartAction::MAX_PER_HOUR; $i++) {
            $this->assertStringStartsWith('https://google.test', $this->get('/api/google/start')->getHeaderLine('Location'));
        }

        $this->assertSame(self::SITE . '/?google=busy', $this->get('/api/google/start')->getHeaderLine('Location'));
        $other = $this->get('/api/google/start', [], '6.6.6.6');
        $this->assertStringStartsWith('https://google.test', $other->getHeaderLine('Location'), 'another address is not affected');
    }

    public function testTooManyReturnsFromOneAddressAreSentBackBusy(): void
    {
        for ($i = 0; $i < GoogleCallbackAction::MAX_PER_HOUR; $i++) {
            $this->get('/api/google/callback?code=c&state=s');
        }

        $this->assertSame(self::SITE . '/?google=busy', $this->get('/api/google/callback?code=c&state=s')->getHeaderLine('Location'));
    }

    public function testAccountsAreSeparateWhenTwoPeopleSignInWithGoogle(): void
    {
        $a = $this->start();
        $first = $this->comeBack('code=a&state=' . $a['state'], $a['binding']);
        $this->google->identity = new GoogleIdentity('sub-2', 'beto@gmail.com');
        $b = $this->start();
        $second = $this->comeBack('code=b&state=' . $b['state'], $b['binding']);

        $tokenA = (string) $this->setCookie($first, SessionCookie::NAME);
        $tokenB = (string) $this->setCookie($second, SessionCookie::NAME);
        $this->assertSame('ana@gmail.com', json_decode((string) $this->get('/api/me', [SessionCookie::NAME => $tokenA])->getBody(), true)['email']);
        $this->assertSame('beto@gmail.com', json_decode((string) $this->get('/api/me', [SessionCookie::NAME => $tokenB])->getBody(), true)['email']);
    }
}
