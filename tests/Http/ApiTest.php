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
use Tests\Support\TestDatabase;

final class ApiTest extends TestCase
{
    private PDO $pdo;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        (new Authenticator($this->pdo))->seedOwner('owner@example.com', 'correct horse', null);
        $config = Config::fromEnv(
            ['DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production'],
            '/app'
        );
        $this->app = AppFactory::create($this->pdo, $config, TestDatabase::MIGRATIONS);
    }

    /**
     * @param array<string, mixed>|null $json
     * @param array<string, string> $cookies
     */
    private function call(string $method, string $uri, ?array $json = null, array $cookies = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://lista.test' . $uri, [
            'REMOTE_ADDR' => '3.3.3.3',
        ]);
        if ($json !== null) {
            $request = $request
                ->withHeader('Content-Type', 'application/json')
                ->withBody((new StreamFactory())->createStream((string) json_encode($json)));
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

    private function signIn(): string
    {
        $response = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'correct horse']);
        $this->assertSame(200, $response->getStatusCode());
        preg_match('~' . SessionCookie::NAME . '=([0-9a-f]+)~', $response->getHeaderLine('Set-Cookie'), $m);

        return $m[1];
    }

    private const SONG_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    /**
     * @param array<string, mixed> $override
     *
     * @return array<string, mixed>
     */
    private function song(array $override = []): array
    {
        return $override + [
            'id' => self::SONG_ID, 'title' => 'Vienen con alegría', 'author' => '', 'body' => '[C]Vienen',
            'updatedAt' => 1_700_000_000_000, 'deleted' => false,
        ];
    }

    public function testSyncNeedsASession(): void
    {
        $this->assertSame(401, $this->call('GET', '/api/sync')->getStatusCode());
        $this->assertSame(401, $this->call('POST', '/api/sync', ['songs' => []])->getStatusCode());
    }

    public function testASongPushedCanBePulledBack(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];

        $push = $this->call('POST', '/api/sync', ['songs' => [$this->song()]], $cookies);
        $pull = $this->call('GET', '/api/sync?since=0', null, $cookies);

        $this->assertSame(200, $push->getStatusCode());
        $this->assertSame([self::SONG_ID], $this->body($push)['applied']);
        $this->assertSame([], $this->body($push)['ignored']);
        $body = $this->body($pull);
        $this->assertSame('Vienen con alegría', $body['songs'][0]['title']);
        $this->assertSame(1, $body['cursor']);
        $this->assertFalse($body['hasMore']);
    }

    public function testPullingFromTheCursorReturnsNothingNew(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];
        $this->call('POST', '/api/sync', ['songs' => [$this->song()]], $cookies);

        $body = $this->body($this->call('GET', '/api/sync?since=1', null, $cookies));

        $this->assertSame([], $body['songs']);
        $this->assertSame(1, $body['cursor'], 'the cursor stays where it was');
    }

    public function testAnOlderSongIsReportedAsIgnored(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];
        $this->call('POST', '/api/sync', ['songs' => [$this->song(['updatedAt' => 2_000_000_000_000 - 1])]], $cookies);

        $body = $this->body($this->call('POST', '/api/sync', ['songs' => [$this->song(['updatedAt' => 5])]], $cookies));

        $this->assertSame([], $body['applied']);
        $this->assertSame([self::SONG_ID], $body['ignored']);
    }

    public function testOneInvalidSongStoresNoneOfTheBatch(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];
        $good = $this->song();
        $bad = $this->song(['id' => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'title' => '']);

        $push = $this->call('POST', '/api/sync', ['songs' => [$good, $bad]], $cookies);

        $this->assertSame(400, $push->getStatusCode());
        $this->assertSame('invalid_song', $this->body($push)['error']);
        $this->assertSame([], $this->body($this->call('GET', '/api/sync?since=0', null, $cookies))['songs']);
    }

    public function testMalformedPayloadsAre400(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];

        foreach ([[], ['songs' => 'x'], ['songs' => ['a' => 1]], ['songs' => ['x']]] as $payload) {
            $this->assertSame(400, $this->call('POST', '/api/sync', $payload, $cookies)->getStatusCode());
        }
        $tooMany = array_fill(0, 101, $this->song());
        $this->assertSame(400, $this->call('POST', '/api/sync', ['songs' => $tooMany], $cookies)->getStatusCode());
    }

    public function testASinceThatIsNotANumberIs400(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];

        foreach (['abc', '-1', '1.5', '', '99999999999999999999'] as $since) {
            $response = $this->call('GET', '/api/sync?since=' . $since, null, $cookies);
            $this->assertSame(400, $response->getStatusCode(), "since=$since");
        }
    }

    public function testPullsComeInPages(): void
    {
        $cookies = [SessionCookie::NAME => $this->signIn()];
        // 201 songs, pushed in batches of at most 100
        foreach ([[0, 100], [100, 200], [200, 201]] as [$from, $to]) {
            $songs = [];
            for ($i = $from; $i < $to; $i++) {
                $songs[] = $this->song(['id' => sprintf('eeeeeeee-eeee-4eee-8eee-%012d', $i), 'title' => "Canto $i"]);
            }
            $this->assertSame(200, $this->call('POST', '/api/sync', ['songs' => $songs], $cookies)->getStatusCode());
        }

        $first = $this->body($this->call('GET', '/api/sync?since=0', null, $cookies));
        $second = $this->body($this->call('GET', '/api/sync?since=' . $first['cursor'], null, $cookies));

        $this->assertCount(200, $first['songs']);
        $this->assertTrue($first['hasMore']);
        $this->assertSame(200, $first['cursor']);
        $this->assertCount(1, $second['songs']);
        $this->assertFalse($second['hasMore']);
    }

    public function testHealthReportsTheSchema(): void
    {
        $response = $this->call('GET', '/api/health');

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('ok', $this->body($response)['status']);
        $this->assertMatchesRegularExpression('~^\d{4}_[\w.]+$~', $this->body($response)['schema']);
        $this->assertSame('no-store', $response->getHeaderLine('Cache-Control'));
    }

    public function testLoginSetsAHardenedCookie(): void
    {
        $response = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'correct horse']);

        $cookie = $response->getHeaderLine('Set-Cookie');
        $this->assertSame('owner@example.com', $this->body($response)['email']);
        $this->assertStringContainsString('HttpOnly', $cookie);
        $this->assertStringContainsString('SameSite=Lax', $cookie);
        $this->assertStringContainsString('Secure', $cookie);
        $this->assertStringContainsString('Max-Age=' . (180 * 86400), $cookie);
    }

    public function testWrongPasswordIs401WithASpanishMessage(): void
    {
        $response = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'nope']);

        $this->assertSame(401, $response->getStatusCode());
        $this->assertSame('invalid_credentials', $this->body($response)['error']);
        $this->assertSame('', $response->getHeaderLine('Set-Cookie'));
    }

    public function testMissingFieldsAre400(): void
    {
        $this->assertSame(400, $this->call('POST', '/api/login', ['email' => 'owner@example.com'])->getStatusCode());
        $this->assertSame(400, $this->call('POST', '/api/login', [])->getStatusCode());
    }

    public function testTooManyFailuresAre429(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'wrong']);
        }

        $response = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'x']);

        $this->assertSame(429, $response->getStatusCode());
    }

    public function testMeNeedsASession(): void
    {
        $this->assertSame(401, $this->call('GET', '/api/me')->getStatusCode());
        $this->assertSame(401, $this->call('GET', '/api/me', null, [SessionCookie::NAME => 'forged'])->getStatusCode());
    }

    public function testMeReturnsTheSignedInUser(): void
    {
        $token = $this->signIn();

        $response = $this->call('GET', '/api/me', null, [SessionCookie::NAME => $token]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('owner@example.com', $this->body($response)['email']);
    }

    public function testLogoutEndsTheSessionAndClearsTheCookie(): void
    {
        $token = $this->signIn();

        $response = $this->call('POST', '/api/logout', [], [SessionCookie::NAME => $token]);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertStringContainsString('Max-Age=0', $response->getHeaderLine('Set-Cookie'));
        $this->assertSame(401, $this->call('GET', '/api/me', null, [SessionCookie::NAME => $token])->getStatusCode());
    }

    public function testChangingRequestsMustBeJson(): void
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', 'https://lista.test/api/logout')
            ->withHeader('Content-Type', 'application/x-www-form-urlencoded');

        $response = $this->app->handle($request);

        $this->assertSame(415, $response->getStatusCode());
        $this->assertSame('unsupported_media_type', $this->body($response)['error']);
    }

    public function testUnknownRoutesAnswerJson404(): void
    {
        $response = $this->call('GET', '/api/nothing');

        $this->assertSame(404, $response->getStatusCode());
        $this->assertSame('not_found', $this->body($response)['error']);
    }

    public function testErrorDetailsAreHiddenInProduction(): void
    {
        $response = $this->call('GET', '/api/nothing');

        $this->assertStringNotContainsString('Not found', $this->body($response)['message']);
    }
}
