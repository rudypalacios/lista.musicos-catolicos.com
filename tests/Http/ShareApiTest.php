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

/** Sharing a list by a link anyone can open: the person's side (with a session) and the visitor's (without one) */
final class ShareApiTest extends TestCase
{
    private const LIST_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    private const OTHER_LIST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private const SONG_ONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const SONG_TWO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    private const GONE_SONG = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    private const ITEM = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee';
    private const SHARE = '/api/lists/' . self::LIST_ID . '/share';

    private PDO $pdo;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        (new Authenticator($this->pdo))->seedOwner('owner@example.com', 'correct horse', null);
        $env = ['DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production'];
        $config = Config::fromEnv($env, '/app');
        $this->app = AppFactory::create($this->pdo, $config, TestDatabase::MIGRATIONS);
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
        array $headers = [],
        string $ip = '3.3.3.3'
    ): ResponseInterface {
        $url = 'https://lista.test' . $uri;
        $request = (new ServerRequestFactory())->createServerRequest($method, $url, ['REMOTE_ADDR' => $ip]);
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

    /** @return array<string, string> */
    private function owner(): array
    {
        $login = $this->call('POST', '/api/login', ['email' => 'owner@example.com', 'password' => 'correct horse']);
        preg_match('~' . SessionCookie::NAME . '=([0-9a-f]+)~', $login->getHeaderLine('Set-Cookie'), $m);

        return [SessionCookie::NAME => $m[1]];
    }

    /**
     * @return array<string, mixed>
     */
    private function song(
        string $id,
        string $title,
        string $author,
        string $body,
        int $at,
        bool $deleted = false
    ): array {
        return [
            'id' => $id, 'title' => $title, 'author' => $author, 'body' => $body,
            'updatedAt' => $at, 'deleted' => $deleted, 'tags' => ['Entrada'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function item(int $n, string $part, string $songId, int $transpose, string $note = ''): array
    {
        return [
            'id' => self::ITEM . $n, 'part' => $part, 'songId' => $songId, 'transpose' => $transpose, 'note' => $note,
        ];
    }

    /**
     * The list and its songs, pushed as the app does
     *
     * @param array<string, string> $cookies
     */
    private function seed(array $cookies, bool $withDeletedSong = false): void
    {
        $items = [
            $this->item(1, 'entrada', self::SONG_ONE, 2, 'privado'),
            $this->item(2, 'comunion', self::SONG_TWO, 0),
            $this->item(3, 'salida', self::SONG_ONE, 0),
        ];
        if ($withDeletedSong) {
            $items[] = $this->item(4, 'entrada', self::GONE_SONG, 0);
        }
        $this->call('POST', '/api/sync', [
            'songs' => [
                $this->song(self::SONG_ONE, 'Caminamos con alegría', 'Ana Pérez', '[C]Caminamos', 1_700_000_000_000),
                $this->song(self::SONG_TWO, 'Pan de vida', '', '[G]Pan de vida', 1_700_000_005_000),
                $this->song(self::GONE_SONG, 'Canto borrado', '', 'borrado', 1_700_000_001_000, true),
            ],
            'setlists' => [[
                'id' => self::LIST_ID, 'title' => 'Misa del 1 de noviembre', 'eventDate' => '2026-11-01',
                'notes' => 'nota privada', 'items' => $items,
                'parts' => [
                    ['id' => 'entrada', 'name' => 'Canto de entrada'],
                    ['id' => 'comunion', 'name' => 'Canto de comunión'],
                    ['id' => 'salida', 'name' => 'Salida', 'off' => true],
                ],
                'starred' => true, 'updatedAt' => 1_700_000_002_000, 'deleted' => false,
            ]],
        ], $cookies);
    }

    /** @param array<string, string> $cookies */
    private function share(array $cookies, bool $withLyrics = true): string
    {
        $response = $this->call('PUT', self::SHARE, ['withLyrics' => $withLyrics], $cookies);
        $this->assertSame(200, $response->getStatusCode());

        return (string) $this->body($response)['code'];
    }

    private function read(string $code, string $ip = '3.3.3.3'): ResponseInterface
    {
        return $this->call('GET', '/api/shared/' . $code, null, [], [], $ip);
    }

    public function testTheOwnersSideNeedsASessionButReadingALinkDoesNot(): void
    {
        $this->assertSame(401, $this->call('GET', self::SHARE)->getStatusCode());
        $this->assertSame(401, $this->call('PUT', self::SHARE, ['withLyrics' => true])->getStatusCode());
        $this->assertSame(401, $this->call('DELETE', self::SHARE, [])->getStatusCode());
        // A link that does not exist is a 404 for anyone, not a request for a session
        $this->assertSame(404, $this->read(str_repeat('a', 32))->getStatusCode());
    }

    public function testASharedListIsReadWithNoSession(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);
        $this->assertMatchesRegularExpression('~^[0-9a-f]{32}$~', $code);

        $response = $this->read($code);
        $view = $this->body($response);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('Misa del 1 de noviembre', $view['title']);
        $this->assertTrue($view['withLyrics']);
        // Only the sections the list shows, in the owner's order; the song in the section that is off is not there
        $this->assertSame(
            [['id' => 'entrada', 'name' => 'Canto de entrada'], ['id' => 'comunion', 'name' => 'Canto de comunión']],
            $view['parts']
        );
        $this->assertSame([
            ['id' => self::ITEM . '1', 'part' => 'entrada', 'songId' => self::SONG_ONE, 'transpose' => 2],
            ['id' => self::ITEM . '2', 'part' => 'comunion', 'songId' => self::SONG_TWO, 'transpose' => 0],
        ], $view['items']);
        $this->assertSame(['Caminamos con alegría', 'Pan de vida'], array_column($view['songs'], 'title'));
        $this->assertSame('[C]Caminamos', $view['songs'][0]['body']);
        // The latest change in the list or in its songs
        $this->assertSame(1_700_000_005_000, $view['updatedAt']);
    }

    public function testNothingPersonalLeavesInTheAnswer(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $text = (string) $this->read($this->share($cookies))->getBody();

        $private = ['owner@example.com', 'nota privada', 'privado', 'Entrada', 'user_id', 'starred'];
        foreach ([...$private, 'eventDate', 'notes', 'tags', 'myShift'] as $word) {
            $this->assertStringNotContainsString($word, $text, $word);
        }
    }

    public function testWithoutLyricsOnlyTheOrderTheTitlesAndTheAuthorsGoOut(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);

        $view = $this->body($this->read($this->share($cookies, false)));

        $this->assertFalse($view['withLyrics']);
        $this->assertSame(['id', 'title', 'author'], array_keys($view['songs'][0]));
        $this->assertSame('Ana Pérez', $view['songs'][0]['author']);
    }

    public function testTheLyricsSwitchChangesWhatTheSameLinkShows(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies, true);

        $again = $this->call('PUT', self::SHARE, ['withLyrics' => false], $cookies);

        $this->assertSame($code, $this->body($again)['code'], 'the link does not change');
        $this->assertFalse($this->body($this->read($code))['withLyrics']);
        $status = $this->body($this->call('GET', self::SHARE, null, $cookies));
        $this->assertSame(['shared' => true, 'code' => $code, 'withLyrics' => false], $status);
    }

    public function testWhatTheOwnerChangesIsWhatTheLinkShows(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);

        $renamed = $this->song(self::SONG_TWO, 'Pan de vida (nueva letra)', '', '[G]Otra', 1_700_000_009_000);
        $this->call('POST', '/api/sync', ['songs' => [$renamed]], $cookies);

        $view = $this->body($this->read($code));
        $this->assertSame('Pan de vida (nueva letra)', $view['songs'][1]['title']);
        $this->assertSame(1_700_000_009_000, $view['updatedAt']);
    }

    public function testASongThatWasDeletedIsLeftOutOfTheLink(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies, true);

        $view = $this->body($this->read($this->share($cookies)));

        $this->assertCount(2, $view['items']);
        $this->assertNotContains('Canto borrado', array_column($view['songs'], 'title'));
    }

    public function testStoppingAShareKillsItsLinkForGoodAndSharingAgainMakesANewOne(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $first = $this->share($cookies);

        $stopped = $this->call('DELETE', self::SHARE, [], $cookies);
        $this->assertSame(['shared' => false], $this->body($stopped));
        $this->assertSame(404, $this->read($first)->getStatusCode());
        $this->assertSame(['shared' => false], $this->body($this->call('GET', self::SHARE, null, $cookies)));
        // Doing it twice is fine
        $this->assertSame(200, $this->call('DELETE', self::SHARE, [], $cookies)->getStatusCode());

        $second = $this->share($cookies);
        $this->assertNotSame($first, $second);
        $this->assertSame(404, $this->read($first)->getStatusCode(), 'the old link stays dead');
        $this->assertSame(200, $this->read($second)->getStatusCode());
    }

    public function testADeletedListStopsBeingShown(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);

        $this->call('POST', '/api/sync', ['setlists' => [[
            'id' => self::LIST_ID, 'title' => 'x', 'eventDate' => null, 'notes' => '', 'items' => [],
            'parts' => [['id' => 'entrada', 'name' => 'Entrada']], 'updatedAt' => 1_700_000_100_000, 'deleted' => true,
        ]]], $cookies);

        $this->assertSame(404, $this->read($code)->getStatusCode());
    }

    public function testAListThatIsNotOnTheServerOrNotTheUsersCannotBeShared(): void
    {
        $cookies = $this->owner();

        $missing = $this->call('PUT', self::SHARE, ['withLyrics' => true], $cookies);
        $this->assertSame(404, $missing->getStatusCode());
        $this->assertStringContainsString('sincronice', (string) $this->body($missing)['message']);

        // Another person's list: the same answer, whatever its id
        $this->pdo->prepare(
            'INSERT INTO setlists '
            . '(id, user_id, title, event_date, notes, items, parts, updated_at, deleted_at, seq, starred) '
            . 'VALUES (?, ?, ?, NULL, ?, ?, ?, 1, NULL, 1, 0)'
        )->execute([self::OTHER_LIST, 'someone-else', 'Ajena', '', '[]', '[]']);
        $other = '/api/lists/' . self::OTHER_LIST . '/share';
        $this->assertSame(404, $this->call('PUT', $other, ['withLyrics' => true], $cookies)->getStatusCode());
        $this->assertSame(404, $this->call('DELETE', $other, [], $cookies)->getStatusCode());
        $this->assertSame(['shared' => false], $this->body($this->call('GET', $other, null, $cookies)));
    }

    public function testTheSwitchMustBeSaidAndBeABoolean(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);

        foreach ([[], ['withLyrics' => 'yes'], ['withLyrics' => 1]] as $bad) {
            $this->assertSame(400, $this->call('PUT', self::SHARE, $bad, $cookies)->getStatusCode());
        }
    }

    public function testAStoppedANeverGivenAndAMalformedLinkAnswerTheSame(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $stopped = $this->share($cookies);
        $this->call('DELETE', self::SHARE, [], $cookies);

        $answers = [];
        foreach ([$stopped, str_repeat('0', 32), 'short', strtoupper($stopped), $stopped . 'x'] as $code) {
            $response = $this->read($code);
            $this->assertSame(404, $response->getStatusCode(), $code);
            $answers[] = (string) $response->getBody();
        }
        $this->assertCount(1, array_unique($answers));
        $this->assertSame('Este enlace ya no existe.', json_decode($answers[0], true)['message']);
    }

    public function testAnAddressThatKeepsMissingHasToWait(): void
    {
        for ($i = 0; $i < 30; $i++) {
            $this->assertSame(404, $this->read(str_repeat('b', 32), '9.9.9.9')->getStatusCode());
        }

        $this->assertSame(429, $this->read(str_repeat('b', 32), '9.9.9.9')->getStatusCode());
        // Another address is not held back
        $this->assertSame(404, $this->read(str_repeat('b', 32), '8.8.8.8')->getStatusCode());
    }

    public function testReadingARealLinkNeverCountsAsAMiss(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);

        for ($i = 0; $i < 40; $i++) {
            $this->assertSame(200, $this->read($code, '9.9.9.9')->getStatusCode());
        }
    }

    public function testTheAnswerCanBeKeptAMinuteAndIsNotModifiedAfterThat(): void
    {
        $cookies = $this->owner();
        $this->seed($cookies);
        $code = $this->share($cookies);

        $first = $this->read($code);
        $etag = $first->getHeaderLine('ETag');

        $this->assertSame('public, max-age=60', $first->getHeaderLine('Cache-Control'));
        $this->assertSame('noindex, nofollow', $first->getHeaderLine('X-Robots-Tag'));
        $this->assertNotSame('', $etag);
        $again = $this->call('GET', '/api/shared/' . $code, null, [], ['If-None-Match' => $etag]);
        $this->assertSame(304, $again->getStatusCode());
        $this->assertSame('', (string) $again->getBody());
        // A change makes a new ETag
        $this->call('PUT', self::SHARE, ['withLyrics' => false], $cookies);
        $changed = $this->call('GET', '/api/shared/' . $code, null, [], ['If-None-Match' => $etag]);
        $this->assertSame(200, $changed->getStatusCode());
        // A link that does not exist is never kept
        $this->assertSame('no-store', $this->read(str_repeat('c', 32))->getHeaderLine('Cache-Control'));
    }
}
