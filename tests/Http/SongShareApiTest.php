<?php

declare(strict_types=1);

namespace Tests\Http;

use App\Auth\Authenticator;
use App\Config;
use App\Http\AppFactory;
use App\Http\SessionCookie;
use App\Share\MissThrottle;
use App\Share\ShareRepository;
use App\Share\SharePreview;
use App\Share\SongShareRepository;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Tests\Support\TestDatabase;

/** Sharing one song by a link anyone can open, and the preview a chat app draws for any link */
final class SongShareApiTest extends TestCase
{
    private const SONG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const OTHER_SONG = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    private const LIST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    private const SHARE = '/api/songs/' . self::SONG . '/share';

    private PDO $pdo;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        (new Authenticator($this->pdo))->seedOwner('owner@example.com', 'correct horse', null);
        $env = ['DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production'];
        $this->app = AppFactory::create($this->pdo, Config::fromEnv($env, '/app'), TestDatabase::MIGRATIONS);
    }

    /**
     * @param array<string, mixed>|null $json
     * @param array<string, string> $cookies
     */
    private function call(string $method, string $uri, ?array $json = null, array $cookies = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest($method, 'https://lista.test' . $uri, ['REMOTE_ADDR' => '3.3.3.3']);
        if ($json !== null) {
            $body = (new StreamFactory())->createStream((string) json_encode($json));
            $request = $request->withHeader('Content-Type', 'application/json')->withBody($body);
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

    /** @return array<string, string> */
    private function owner(): array
    {
        $login = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'correct horse']);
        preg_match('~' . SessionCookie::NAME . '=([0-9a-f]+)~', $login->getHeaderLine('Set-Cookie'), $m);

        return [SessionCookie::NAME => $m[1]];
    }

    /** @param array<string, string> $cookies */
    private function seed(array $cookies, bool $deleted = false): void
    {
        $song = static fn (string $id, string $title, string $author, string $body, bool $gone): array => [
            'id' => $id, 'title' => $title, 'author' => $author, 'body' => $body,
            'updatedAt' => 1_700_000_000_000, 'deleted' => $gone, 'tags' => ['Entrada'],
        ];
        $this->call('POST', '/api/sync', [
            'songs' => [
                $song(self::SONG, 'Caminamos con alegría', 'Ana Pérez', '[C]Caminamos', $deleted),
                $song(self::OTHER_SONG, 'Pan de vida', '', '[G]Pan de vida', false),
            ],
            'setlists' => [],
        ], $cookies);
    }

    /** @param array<string, string> $cookies */
    private function share(array $cookies): string
    {
        $response = $this->call('PUT', self::SHARE, [], $cookies);
        $this->assertSame(200, $response->getStatusCode());

        return (string) $this->body($response)['code'];
    }

    public function testTheOwnersSideNeedsASession(): void
    {
        foreach (['GET', 'PUT', 'DELETE'] as $method) {
            $this->assertSame(401, $this->call($method, self::SHARE, [])->getStatusCode(), $method);
        }
    }

    public function testASharedSongIsReadWithNoSessionAsAListOfOne(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);
        $this->assertMatchesRegularExpression('~^[0-9a-f]{32}$~', $code);

        $response = $this->call('GET', '/api/shared/' . $code);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('noindex, nofollow', $response->getHeaderLine('X-Robots-Tag'));
        $view = $this->body($response);
        $this->assertSame('song', $view['kind']);
        $this->assertSame('Caminamos con alegría', $view['title']);
        $this->assertTrue($view['withLyrics']);
        $this->assertSame([[
            'id' => self::SONG, 'title' => 'Caminamos con alegría', 'author' => 'Ana Pérez', 'body' => '[C]Caminamos',
        ]], $view['songs']);
        $this->assertCount(1, $view['items']);
        $this->assertSame(0, $view['items'][0]['transpose']);
        // Nothing else of the person leaves: no tags, no id of the account, no other song
        $this->assertStringNotContainsString('Entrada', (string) $response->getBody());
        $this->assertStringNotContainsString('Pan de vida', (string) $response->getBody());
        $this->assertStringNotContainsString('owner@example.com', (string) $response->getBody());
    }

    public function testStatusSaysWhetherTheSongIsSharedAndAskingAgainKeepsTheLink(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $this->assertSame(['shared' => false], $this->body($this->call('GET', self::SHARE, null, $cookies)));

        $code = $this->share($cookies);

        $this->assertSame($code, $this->share($cookies));
        $this->assertSame(
            ['shared' => true, 'code' => $code],
            $this->body($this->call('GET', self::SHARE, null, $cookies))
        );
    }

    public function testStoppingKillsTheLinkForGoodAndSharingAgainMakesANewOne(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);

        $stop = $this->call('DELETE', self::SHARE, [], $cookies);

        $this->assertSame(['shared' => false], $this->body($stop));
        $this->assertSame(404, $this->call('GET', '/api/shared/' . $code)->getStatusCode());
        $again = $this->share($cookies);
        $this->assertNotSame($code, $again);
        $this->assertSame(404, $this->call('GET', '/api/shared/' . $code)->getStatusCode());
        $this->assertSame(200, $this->call('GET', '/api/shared/' . $again)->getStatusCode());
    }

    public function testWhatTheOwnerChangesIsWhatTheLinkShowsAndADeletedSongStopsBeingShown(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);
        $this->call('POST', '/api/sync', ['songs' => [[
            'id' => self::SONG, 'title' => 'Caminamos', 'author' => 'Ana', 'body' => '[D]Nueva',
            'updatedAt' => 1_700_000_009_000, 'deleted' => false, 'tags' => [],
        ]], 'setlists' => []], $cookies);

        $view = $this->body($this->call('GET', '/api/shared/' . $code));
        $this->assertSame('[D]Nueva', $view['songs'][0]['body']);

        $this->call('POST', '/api/sync', ['songs' => [[
            'id' => self::SONG, 'title' => 'Caminamos', 'author' => 'Ana', 'body' => '',
            'updatedAt' => 1_700_000_010_000, 'deleted' => true, 'tags' => [],
        ]], 'setlists' => []], $cookies);
        $this->assertSame(404, $this->call('GET', '/api/shared/' . $code)->getStatusCode());
    }

    public function testASongThatIsNotOnTheServerOrNotTheUsersCannotBeShared(): void
    {
        $cookies = $this->owner();

        $this->assertSame(404, $this->call('PUT', self::SHARE, [], $cookies)->getStatusCode());
        $this->assertSame(404, $this->call('PUT', '/api/songs/not-an-id/share', [], $cookies)->getStatusCode());
        $this->assertSame(404, $this->call('DELETE', self::SHARE, [], $cookies)->getStatusCode());
        // A list's id is not a song's
        $asSong = '/api/songs/' . self::LIST . '/share';
        $this->assertSame(404, $this->call('PUT', $asSong, [], $cookies)->getStatusCode());
    }

    public function testThePreviewNamesTheListOrTheSongOnlyWhileTheirLinkLives(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $this->call('POST', '/api/sync', ['songs' => [], 'setlists' => [[
            'id' => self::LIST, 'title' => 'Misa del domingo', 'eventDate' => '2026-11-01', 'notes' => '',
            'items' => [], 'parts' => [['id' => 'entrada', 'name' => 'Entrada']], 'starred' => false,
            'updatedAt' => 1_700_000_002_000, 'deleted' => false,
        ]]], $cookies);
        $listShare = '/api/lists/' . self::LIST . '/share';
        $listCode = (string) $this->body($this->call('PUT', $listShare, ['withLyrics' => true], $cookies))['code'];
        $songCode = $this->share($cookies);
        $preview = new SharePreview(
            new ShareRepository($this->pdo),
            new SongShareRepository($this->pdo),
            new MissThrottle($this->pdo)
        );

        $this->assertSame(['kind' => 'list', 'title' => 'Misa del domingo'], $preview->of($listCode, '4.4.4.4'));
        $this->assertSame(['kind' => 'song', 'title' => 'Caminamos con alegría'], $preview->of($songCode, '4.4.4.4'));

        $this->call('DELETE', self::SHARE, [], $cookies);
        $this->call('DELETE', $listShare, [], $cookies);
        $this->assertNull($preview->of($listCode, '4.4.4.4'));
        $this->assertNull($preview->of($songCode, '4.4.4.4'));
        $this->assertNull($preview->of('short', '4.4.4.4'));
    }

    public function testThePreviewSlowsDownAnAddressThatKeepsMissing(): void
    {
        $preview = new SharePreview(
            new ShareRepository($this->pdo),
            new SongShareRepository($this->pdo),
            new MissThrottle($this->pdo)
        );
        for ($i = 0; $i < 30; $i++) {
            $this->assertNull($preview->of(str_repeat('a', 32), '9.9.9.9'));
        }
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);

        // Held back, even for a real link; another address is not
        $this->assertNull($preview->of($code, '9.9.9.9'));
        $this->assertNotNull($preview->of($code, '8.8.8.8'));
    }
}
