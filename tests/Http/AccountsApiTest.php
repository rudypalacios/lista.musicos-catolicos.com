<?php

declare(strict_types=1);

namespace Tests\Http;

use App\Auth\Authenticator;
use App\Config;
use App\Http\AppFactory;
use App\Http\SessionCookie;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Tests\Security\ProofOfWorkTest;
use Tests\Support\RecordingMailer;
use Tests\Support\TestDatabase;

/** Accounts of other people: signing up, confirming the address, recovering a password */
final class AccountsApiTest extends TestCase
{
    private const PASSWORD = 'una clave bien larga';
    private const SITE = 'https://lista.example.org';

    private PDO $pdo;
    private RecordingMailer $mailer;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        (new Authenticator($this->pdo))->seedOwner('owner@example.com', 'correct horse', null);
        $this->mailer = new RecordingMailer();
        $env = [
            'DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production',
            'APP_URL' => self::SITE . '/', 'SIGNUP_OPEN' => '1',
        ];
        $config = Config::fromEnv($env, '/app');
        $this->app = AppFactory::create($this->pdo, $config, TestDatabase::MIGRATIONS, $this->mailer);
    }

    /**
     * @param array<string, mixed>|null $json
     * @param array<string, string> $cookies
     * @param array<string, string> $headers
     */
    private function call(
        string $method,
        string $uri,
        ?array $json = null,
        array $cookies = [],
        string $ip = '5.5.5.5',
        array $headers = []
    ): ResponseInterface {
        $request = (new ServerRequestFactory())
            ->createServerRequest($method, 'https://lista.test' . $uri, ['REMOTE_ADDR' => $ip]);
        if ($json !== null) {
            $body = (new StreamFactory())->createStream((string) json_encode($json));
            $request = $request->withHeader('Content-Type', 'application/json')->withBody($body);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $this->app->handle($request->withCookieParams($cookies));
    }

    /** @return array<string, mixed> */
    private function body(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true);
        $this->assertIsArray($data);

        return $data;
    }

    /** @return array{challenge: string, nonce: string} a puzzle asked for and solved, as the browser does */
    private function pow(): array
    {
        $challenge = (string) $this->body($this->call('GET', '/api/challenge'))['challenge'];

        return ['challenge' => $challenge, 'nonce' => ProofOfWorkTest::solve($challenge)];
    }

    /** @return array<string, string> the session cookie of a response */
    private function cookieOf(ResponseInterface $response): array
    {
        preg_match('~' . SessionCookie::NAME . '=([0-9a-f]+)~', $response->getHeaderLine('Set-Cookie'), $m);

        return [SessionCookie::NAME => $m[1] ?? ''];
    }

    /** @return array<string, string> the cookie of the new account */
    private function signUp(string $email = 'ana@example.com', string $ip = '5.5.5.5'): array
    {
        $response = $this->call('POST', '/api/register', [
            'email' => $email, 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ], [], $ip);
        $this->assertSame(201, $response->getStatusCode(), (string) $response->getBody());

        return $this->cookieOf($response);
    }

    public function testASignUpOpensTheSessionAndSendsTheLinkThatConfirmsTheAddress(): void
    {
        $response = $this->call('POST', '/api/register', [
            'email' => '  Ana@Example.com ', 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ]);

        $this->assertSame(201, $response->getStatusCode());
        $expected = ['email' => 'ana@example.com', 'verified' => false, 'mailSent' => true];
        $this->assertSame($expected, $this->body($response));
        $cookies = $this->cookieOf($response);
        $this->assertSame(
            ['email' => 'ana@example.com', 'verified' => false],
            $this->body($this->call('GET', '/api/me', null, $cookies))
        );
        $this->assertCount(1, $this->mailer->sent);
        $this->assertSame('ana@example.com', $this->mailer->sent[0]['to']);
        $this->assertStringContainsString(self::SITE . '/verificar/', $this->mailer->sent[0]['text']);

        $token = $this->mailer->lastToken('ana@example.com');
        $confirmed = $this->call('POST', '/api/verify-email', ['token' => $token]);

        $this->assertSame(200, $confirmed->getStatusCode());
        $this->assertSame(['email' => 'ana@example.com'], $this->body($confirmed));
        $this->assertTrue($this->body($this->call('GET', '/api/me', null, $cookies))['verified']);
        $this->assertSame(400, $this->call('POST', '/api/verify-email', ['token' => $token])->getStatusCode(), 'once');
    }

    public function testNobodyCanSignUpUntilTheOwnerOpensIt(): void
    {
        $env = ['DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production'];
        $closed = Config::fromEnv($env, '/app');
        $this->app = AppFactory::create($this->pdo, $closed, TestDatabase::MIGRATIONS, $this->mailer);

        $response = $this->call('POST', '/api/register', [
            'email' => 'ana@example.com', 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ]);

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('signup_closed', $this->body($response)['error']);
        $this->assertSame([], $this->mailer->sent);
    }

    public function testThePasswordOfANewAccountWorksAtTheSignIn(): void
    {
        $this->signUp();

        $login = $this->call('POST', '/api/login', ['email' => 'ana@example.com', 'password' => self::PASSWORD]);

        $this->assertSame(200, $login->getStatusCode());
    }

    public function testTheOwnerIsConfirmedFromTheStart(): void
    {
        $login = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'correct horse']);

        $this->assertTrue($this->body($this->call('GET', '/api/me', null, $this->cookieOf($login)))['verified']);
    }

    public function testWithoutASolvedPuzzleThereIsNoAccount(): void
    {
        $good = ['email' => 'ana@example.com', 'password' => self::PASSWORD];
        $spent = $this->pow();
        $this->call('POST', '/api/register', $good + ['pow' => $spent], [], '6.6.6.6');
        $wrong = $this->pow();
        $wrong['nonce'] = 'x';

        foreach ([[], ['pow' => 'no'], ['pow' => $wrong], ['pow' => $spent]] as $extra) {
            $response = $this->call('POST', '/api/register', ['email' => 'beto@example.com'] + $good + $extra);
            $this->assertSame(403, $response->getStatusCode(), json_encode($extra) ?: '');
            $this->assertSame('invalid_proof', $this->body($response)['error']);
        }
        $created = $this->pdo->query("SELECT COUNT(*) FROM users WHERE email = 'beto@example.com'")->fetchColumn();
        $this->assertSame(0, (int) $created);
    }

    public function testWhatIsWrongWithTheFormIsSaidWithoutSpendingThePuzzle(): void
    {
        $pow = $this->pow();
        $cases = [
            ['not an address', self::PASSWORD, 'invalid_email'],
            ['ana@example.com', 'corta', 'weak_password'],
            ['ana@example.com', str_repeat('a', 73), 'weak_password'],
        ];

        foreach ($cases as [$email, $password, $code]) {
            $form = ['email' => $email, 'password' => $password, 'pow' => $pow];
            $response = $this->call('POST', '/api/register', $form);
            $this->assertSame(400, $response->getStatusCode(), $code);
            $this->assertSame($code, $this->body($response)['error']);
        }
        $this->assertSame(400, $this->call('POST', '/api/register', ['email' => 'ana@example.com'])->getStatusCode());
        // The same puzzle still opens the sign-up once the form is right
        $form = ['email' => 'ana@example.com', 'password' => self::PASSWORD, 'pow' => $pow];
        $ok = $this->call('POST', '/api/register', $form);
        $this->assertSame(201, $ok->getStatusCode());
    }

    public function testAnAddressThatAlreadyHasAnAccountIsToldSoWhateverTheCase(): void
    {
        $this->signUp('ana@example.com');

        $response = $this->call('POST', '/api/register', [
            'email' => 'ANA@example.com', 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ]);

        $this->assertSame(409, $response->getStatusCode());
        $this->assertSame('email_taken', $this->body($response)['error']);
    }

    public function testOneAddressCannotMakeAccountsWithoutEnd(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->signUp("p{$i}@example.com", '7.7.7.7');
        }

        $response = $this->call('POST', '/api/register', [
            'email' => 'one-more@example.com', 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ], [], '7.7.7.7');

        $this->assertSame(429, $response->getStatusCode());
        $this->signUp('elsewhere@example.com', '8.8.8.8');
    }

    public function testTheLinkPointsAtTheSitesOwnAddressNotAtTheHostOfTheRequest(): void
    {
        $this->call('POST', '/api/register', [
            'email' => 'ana@example.com', 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ], [], '5.5.5.5', ['Host' => 'evil.example']);

        $text = $this->mailer->sent[0]['text'];
        $this->assertStringContainsString(self::SITE . '/verificar/', $text);
        $this->assertStringNotContainsString('evil.example', $text);
    }

    public function testAMailServerThatFailsDoesNotUndoTheAccountAndTheLinkCanBeSentAgain(): void
    {
        // The failure is written to the error log, as it is in production: keep it out of the test output
        ini_set('error_log', '/dev/null');
        $this->mailer->failing = true;
        $response = $this->call('POST', '/api/register', [
            'email' => 'ana@example.com', 'password' => self::PASSWORD, 'pow' => $this->pow(),
        ]);
        $this->assertSame(201, $response->getStatusCode());
        $this->assertFalse($this->body($response)['mailSent']);

        $this->mailer->failing = false;
        $again = $this->call('POST', '/api/verify-email/resend', [], $this->cookieOf($response));

        $this->assertSame(['mailSent' => true], $this->body($again));
        $this->assertCount(1, $this->mailer->sent);
    }

    public function testResendingNeedsASessionCancelsTheOldLinkAndHasALimit(): void
    {
        $this->assertSame(401, $this->call('POST', '/api/verify-email/resend', [])->getStatusCode());
        $cookies = $this->signUp();
        $first = $this->mailer->lastToken('ana@example.com');

        $this->call('POST', '/api/verify-email/resend', [], $cookies);
        $second = $this->mailer->lastToken('ana@example.com');

        $this->assertNotSame($first, $second);
        $this->assertSame(400, $this->call('POST', '/api/verify-email', ['token' => $first])->getStatusCode());
        $this->assertSame(200, $this->call('POST', '/api/verify-email', ['token' => $second])->getStatusCode());
        $again = $this->call('POST', '/api/verify-email/resend', [], $cookies);
        $this->assertSame(['mailSent' => false], $this->body($again), 'an address already confirmed gets no mail');
    }

    public function testResendingHasALimitPerAccount(): void
    {
        $cookies = $this->signUp();

        $codes = [];
        for ($i = 0; $i < 4; $i++) {
            $codes[] = $this->call('POST', '/api/verify-email/resend', [], $cookies)->getStatusCode();
        }

        $this->assertSame([200, 200, 200, 429], $codes);
    }

    public function testALinkThatExpiredOrIsNotACodeDoesNotWork(): void
    {
        $this->signUp();
        $token = $this->mailer->lastToken('ana@example.com');
        $this->pdo->exec('UPDATE email_tokens SET expires_at = 1');

        foreach ([$token, 'short', str_repeat('g', 64), ''] as $bad) {
            $response = $this->call('POST', '/api/verify-email', ['token' => $bad]);
            $this->assertSame(400, $response->getStatusCode());
            $this->assertSame('invalid_token', $this->body($response)['error']);
        }
    }

    public function testAForgottenPasswordIsChosenAgainByTheLink(): void
    {
        $oldSession = $this->signUp();

        $asked = $this->call('POST', '/api/forgot', ['email' => 'ANA@example.com', 'pow' => $this->pow()]);

        $this->assertSame(['ok' => true], $this->body($asked));
        $this->assertStringContainsString(self::SITE . '/restablecer/', $this->mailer->sent[1]['text']);
        $token = $this->mailer->lastToken('ana@example.com');

        $weak = $this->call('POST', '/api/reset', ['token' => $token, 'password' => 'corta']);
        $this->assertSame('weak_password', $this->body($weak)['error']);

        $done = $this->call('POST', '/api/reset', ['token' => $token, 'password' => 'otra clave muy larga']);

        $this->assertSame(['email' => 'ana@example.com'], $this->body($done));
        $this->assertSame(401, $this->call('GET', '/api/me', null, $oldSession)->getStatusCode(), 'every session ends');
        $old = ['email' => 'ana@example.com', 'password' => self::PASSWORD];
        $new = ['email' => 'ana@example.com', 'password' => 'otra clave muy larga'];
        $this->assertSame(401, $this->call('POST', '/api/login', $old)->getStatusCode());
        $login = $this->call('POST', '/api/login', $new);
        $this->assertSame(200, $login->getStatusCode());
        $me = $this->body($this->call('GET', '/api/me', null, $this->cookieOf($login)));
        $this->assertTrue($me['verified'], 'the link reached the address');
        $again = $this->call('POST', '/api/reset', ['token' => $token, 'password' => 'otra clave muy larga']);
        $this->assertSame(400, $again->getStatusCode(), 'a link works once');
    }

    public function testAskingToRecoverAnUnknownAddressLooksTheSameAndSendsNothing(): void
    {
        $known = $this->call('POST', '/api/forgot', ['email' => 'owner@example.com', 'pow' => $this->pow()]);
        $unknown = $this->call('POST', '/api/forgot', ['email' => 'nobody@example.com', 'pow' => $this->pow()]);

        $this->assertSame((string) $known->getBody(), (string) $unknown->getBody());
        $this->assertSame($known->getStatusCode(), $unknown->getStatusCode());
        $this->assertSame(['owner@example.com'], array_column($this->mailer->sent, 'to'));
    }

    public function testRecoveringNeedsTheSolvedPuzzleAndAnAddressGetsFewMails(): void
    {
        $this->assertSame(403, $this->call('POST', '/api/forgot', ['email' => 'owner@example.com'])->getStatusCode());

        for ($i = 0; $i < 5; $i++) {
            $form = ['email' => 'owner@example.com', 'pow' => $this->pow()];
            $this->assertSame(200, $this->call('POST', '/api/forgot', $form)->getStatusCode());
        }

        $this->assertCount(3, $this->mailer->sent, 'past three an hour the answer is the same and nothing is sent');
    }

    public function testARequestWithNoAddressIsRefusedAndSendsNothing(): void
    {
        $this->call('POST', '/api/forgot', ['email' => 'owner@example.com', 'pow' => $this->pow()], [], '9.9.9.9');

        $this->assertCount(1, $this->mailer->sent);
        $this->assertSame(400, $this->call('POST', '/api/forgot', [], [], '9.9.9.9')->getStatusCode());
    }
}
