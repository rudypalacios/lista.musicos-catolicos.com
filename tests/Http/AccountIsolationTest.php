<?php

declare(strict_types=1);

namespace Tests\Http;

use App\Config;
use App\Http\AppFactory;
use App\Http\SessionCookie;
use App\Uuid;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Tests\Support\TestDatabase;

/**
 * Two accounts that hold records with the same ids (the Mass template has a fixed id in every account, and a person
 * who tried the app before signing up brings the ids they were given): each sees and changes only their own, in the
 * sync and in what they share by a link.
 */
final class AccountIsolationTest extends TestCase
{
    private const SONG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const TEMPLATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    private PDO $pdo;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        foreach (['ana@example.com', 'beto@example.com'] as $email) {
            $this->pdo
                ->prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
                ->execute([Uuid::v4(), $email, password_hash('clave larga', PASSWORD_DEFAULT), gmdate('Y-m-d H:i:s')]);
        }
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
    private function login(string $email): array
    {
        $response = $this->call('POST', '/api/login', ['email' => $email, 'password' => 'clave larga']);
        preg_match('~' . SessionCookie::NAME . '=([0-9a-f]+)~', $response->getHeaderLine('Set-Cookie'), $m);

        return [SessionCookie::NAME => $m[1]];
    }

    /** @param array<string, string> $cookies */
    private function push(array $cookies, string $songTitle, string $templateName, int $at): void
    {
        $response = $this->call('POST', '/api/sync', [
            'songs' => [[
                'id' => self::SONG, 'title' => $songTitle, 'author' => '', 'body' => '[C]x', 'updatedAt' => $at,
                'deleted' => false, 'tags' => [],
            ]],
            'setlists' => [],
            'templates' => [[
                'id' => self::TEMPLATE, 'name' => $templateName, 'parts' => [['id' => 'entrada', 'name' => 'Entrada']],
                'updatedAt' => $at, 'deleted' => false,
            ]],
        ], $cookies);
        $this->assertSame(200, $response->getStatusCode());
    }

    public function testTwoAccountsWithTheSameIdsEachKeepAndSeeTheirOwn(): void
    {
        $ana = $this->login('ana@example.com');
        $beto = $this->login('beto@example.com');

        $this->push($ana, 'Canto de Ana', 'Misa de Ana', 1000);
        $this->push($beto, 'Canto de Beto', 'Misa de Beto', 2000);
        $this->push($ana, 'Canto de Ana, editado', 'Misa de Ana', 3000);

        $seenByAna = $this->body($this->call('GET', '/api/sync?since=0', null, $ana));
        $seenByBeto = $this->body($this->call('GET', '/api/sync?since=0', null, $beto));
        $this->assertSame(['Canto de Ana, editado'], array_column($seenByAna['songs'], 'title'));
        $this->assertSame(['Misa de Ana'], array_column($seenByAna['templates'], 'name'));
        $this->assertSame(['Canto de Beto'], array_column($seenByBeto['songs'], 'title'));
        $this->assertSame(['Misa de Beto'], array_column($seenByBeto['templates'], 'name'));
    }

    public function testWhatEachOneSharesIsTheirOwnEvenWithTheSameSongId(): void
    {
        $ana = $this->login('ana@example.com');
        $beto = $this->login('beto@example.com');
        $this->push($ana, 'Canto de Ana', 'Misa de Ana', 1000);
        $this->push($beto, 'Canto de Beto', 'Misa de Beto', 2000);

        $share = '/api/songs/' . self::SONG . '/share';
        $anaCode = (string) $this->body($this->call('PUT', $share, [], $ana))['code'];
        $betoCode = (string) $this->body($this->call('PUT', $share, [], $beto))['code'];

        $this->assertNotSame($anaCode, $betoCode);
        $this->assertSame('Canto de Ana', $this->body($this->call('GET', '/api/shared/' . $anaCode))['title']);
        $this->assertSame('Canto de Beto', $this->body($this->call('GET', '/api/shared/' . $betoCode))['title']);
        // One stops theirs: the other's link goes on
        $this->call('DELETE', $share, [], $ana);
        $this->assertSame(404, $this->call('GET', '/api/shared/' . $anaCode)->getStatusCode());
        $this->assertSame(200, $this->call('GET', '/api/shared/' . $betoCode)->getStatusCode());
    }
}
