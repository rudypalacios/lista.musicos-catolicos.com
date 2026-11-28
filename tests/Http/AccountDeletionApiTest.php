<?php

declare(strict_types=1);

namespace Tests\Http;

use App\Auth\AccountDeletion;
use App\Auth\Google\GoogleAccounts;
use App\Auth\Google\GoogleIdentity;
use App\Config;
use App\Database\Query;
use App\Http\AppFactory;
use App\Http\SessionCookie;
use App\Uuid;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use Tests\Support\RecordingMailer;
use Tests\Support\TestDatabase;

/**
 * Deleting an account: a link by email, 3 days locked in case the person changes their mind, then gone for good, with nothing of
 * anybody else touched.
 */
final class AccountDeletionApiTest extends TestCase
{
    private const SONG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    private const SITE = 'https://lista.example.org';
    private const DAY_MS = 86_400_000;

    private PDO $pdo;
    private RecordingMailer $mailer;
    /** @var App<\Psr\Container\ContainerInterface|null> */
    private App $app;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        foreach (['ana@example.com', 'beto@example.com'] as $email) {
            $this->pdo
                ->prepare('INSERT INTO users (id, email, password_hash, created_at, email_verified_at) VALUES (?, ?, ?, ?, ?)')
                ->execute([Uuid::v4(), $email, password_hash('clave larga', PASSWORD_DEFAULT), gmdate('Y-m-d H:i:s'), 1]);
        }
        $this->mailer = new RecordingMailer();
        $env = ['DB_DRIVER' => 'sqlite', 'DB_PATH' => ':memory:', 'APP_ENV' => 'production', 'APP_URL' => self::SITE];
        $this->app = AppFactory::create($this->pdo, Config::fromEnv($env, '/app'), TestDatabase::MIGRATIONS, $this->mailer);
    }

    /**
     * @param array<string, mixed>|null $json
     * @param array<string, string> $cookies
     */
    private function call(string $method, string $uri, ?array $json = null, array $cookies = [], string $ip = '3.3.3.3'): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://lista.test' . $uri, ['REMOTE_ADDR' => $ip]);
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
        $this->assertSame(200, $response->getStatusCode());
        preg_match('~' . SessionCookie::NAME . '=([0-9a-f]+)~', $response->getHeaderLine('Set-Cookie'), $m);

        return [SessionCookie::NAME => $m[1]];
    }

    /** @param array<string, string> $cookies */
    private function pushSong(array $cookies, string $title): void
    {
        $response = $this->call('POST', '/api/sync', [
            'songs' => [[
                'id' => self::SONG, 'title' => $title, 'author' => '', 'body' => '[C]x', 'updatedAt' => 1000, 'deleted' => false,
                'tags' => [],
            ]],
        ], $cookies);
        $this->assertSame(200, $response->getStatusCode());
    }

    /** @param array<string, string> $cookies */
    private function shareSong(array $cookies): string
    {
        return (string) $this->body($this->call('PUT', '/api/songs/' . self::SONG . '/share', [], $cookies))['code'];
    }

    private function rows(string $table, string $email): int
    {
        return (int) Query::scalar(
            $this->pdo,
            'SELECT COUNT(*) FROM ' . $table . ' WHERE user_id = (SELECT id FROM users WHERE email = ?)',
            [$email]
        );
    }

    private function userExists(string $email): bool
    {
        return (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM users WHERE email = ?', [$email]) === 1;
    }

    /** The account asked to be deleted and said yes on the page of the link: the code that was in the email, spent */
    private function lockAccount(string $email): void
    {
        $cookies = $this->login($email);
        $this->assertSame(200, $this->call('POST', '/api/account/delete-request', [], $cookies)->getStatusCode());
        $answer = $this->call('POST', '/api/account/delete-confirm', ['token' => $this->mailer->lastToken($email)]);
        $this->assertSame(200, $answer->getStatusCode());
    }

    public function testAskingSendsALinkToTheAccountsAddressAndChangesNothing(): void
    {
        $ana = $this->login('ana@example.com');
        $this->pushSong($ana, 'Canto de Ana');

        $response = $this->call('POST', '/api/account/delete-request', [], $ana);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(['mailSent' => true], $this->body($response));
        $this->assertCount(1, $this->mailer->sent);
        $this->assertSame('ana@example.com', $this->mailer->sent[0]['to']);
        $this->assertMatchesRegularExpression('~' . preg_quote(self::SITE, '~') . '/eliminar/[0-9a-f]{64}\s~', $this->mailer->sent[0]['text']);
        $this->assertStringContainsString('3 días', $this->mailer->sent[0]['text']);
        $me = $this->body($this->call('GET', '/api/me', null, $ana));
        $this->assertNull($me['deleteAfter'], 'asking is not deleting');
        $this->assertSame(200, $this->call('GET', '/api/sync?since=0', null, $ana)->getStatusCode(), 'it goes on as any account');
    }

    public function testAskingNeedsASessionAndIsLimited(): void
    {
        $this->assertSame(401, $this->call('POST', '/api/account/delete-request', [])->getStatusCode());

        $ana = $this->login('ana@example.com');
        for ($i = 0; $i < 3; $i++) {
            $this->assertSame(200, $this->call('POST', '/api/account/delete-request', [], $ana)->getStatusCode());
        }
        $this->assertSame(429, $this->call('POST', '/api/account/delete-request', [], $ana)->getStatusCode());
        $beto = $this->login('beto@example.com');
        $this->assertSame(200, $this->call('POST', '/api/account/delete-request', [], $beto)->getStatusCode(), 'another account is not limited');
    }

    public function testIfTheMailFailsTheAnswerSaysSoAndNothingWasStarted(): void
    {
        $this->mailer->failing = true;
        $ana = $this->login('ana@example.com');

        $response = $this->call('POST', '/api/account/delete-request', [], $ana);

        $this->assertSame(['mailSent' => false], $this->body($response));
    }

    public function testThePageOfTheLinkShowsWhatWillGoWithoutSpendingTheCode(): void
    {
        $ana = $this->login('ana@example.com');
        $this->pushSong($ana, 'Canto de Ana');
        $this->call('POST', '/api/account/delete-request', [], $ana);
        $token = $this->mailer->lastToken('ana@example.com');

        $first = $this->call('POST', '/api/account/delete-preview', ['token' => $token]);
        $second = $this->call('POST', '/api/account/delete-preview', ['token' => $token]);

        $this->assertSame(200, $first->getStatusCode(), 'it needs no session: the link opens in any browser');
        $this->assertSame(['email' => 'ana@example.com', 'songs' => 1, 'lists' => 0, 'templates' => 0], $this->body($first));
        $this->assertSame(200, $second->getStatusCode(), 'looking does not spend it');
        $this->assertNull($this->body($this->call('GET', '/api/me', null, $ana))['deleteAfter'], 'and does not delete');
    }

    public function testTheMassThatEveryAccountHasIsNotCountedAsSomethingTheyMade(): void
    {
        $ana = $this->login('ana@example.com');
        $templates = [
            ['id' => AccountDeletion::DEFAULT_TEMPLATE, 'name' => 'Misa', 'parts' => [['id' => 'entrada', 'name' => 'Entrada']], 'updatedAt' => 1000, 'deleted' => false],
            ['id' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'name' => 'Rosario', 'parts' => [['id' => 'misterios', 'name' => 'Misterios']], 'updatedAt' => 1000, 'deleted' => false],
        ];
        $this->assertSame(200, $this->call('POST', '/api/sync', ['templates' => $templates], $ana)->getStatusCode());
        $this->call('POST', '/api/account/delete-request', [], $ana);

        $preview = $this->body($this->call('POST', '/api/account/delete-preview', ['token' => $this->mailer->lastToken('ana@example.com')]));

        $this->assertSame(1, $preview['templates'], 'the Rosario, not the Misa');
    }

    public function testALinkThatDoesNotWorkIsTheSameAnswerForEveryReason(): void
    {
        $ana = $this->login('ana@example.com');
        $this->call('POST', '/api/account/delete-request', [], $ana);
        $good = $this->mailer->lastToken('ana@example.com');
        // The code of another kind of link is not a code for this
        $this->call('POST', '/api/forgot', ['email' => 'ana@example.com', 'pow' => ['challenge' => 'x', 'nonce' => 'y']]);
        $this->pdo->prepare("UPDATE email_tokens SET purpose = 'reset' WHERE token_hash = ?")->execute([hash('sha256', $good)]);

        foreach (['', 'no es un código', str_repeat('a', 64), $good] as $token) {
            foreach (['preview', 'confirm'] as $step) {
                $response = $this->call('POST', '/api/account/delete-' . $step, ['token' => $token]);
                $this->assertSame(400, $response->getStatusCode());
                $this->assertSame('invalid_token', $this->body($response)['error']);
            }
        }
    }

    public function testSayingYesLocksTheAccountFor3DaysAndEndsEverySession(): void
    {
        $ana = $this->login('ana@example.com');
        $other = $this->login('ana@example.com');
        $this->call('POST', '/api/account/delete-request', [], $ana);
        $before = (int) (microtime(true) * 1000);

        $response = $this->call('POST', '/api/account/delete-confirm', ['token' => $this->mailer->lastToken('ana@example.com')]);

        $this->assertSame(200, $response->getStatusCode());
        $answer = $this->body($response);
        $this->assertSame('ana@example.com', $answer['email']);
        $this->assertEqualsWithDelta($before + 3 * self::DAY_MS, $answer['deleteAfter'], 5000);
        $this->assertSame(401, $this->call('GET', '/api/me', null, $ana)->getStatusCode(), 'every session ended');
        $this->assertSame(401, $this->call('GET', '/api/me', null, $other)->getStatusCode(), 'on every device');
        $this->assertSame(400, $this->call('POST', '/api/account/delete-confirm', ['token' => $this->mailer->lastToken('ana@example.com')])->getStatusCode(), 'the code works once');
    }

    public function testSayingYesTwiceDoesNotMoveTheDay(): void
    {
        // Not possible from the app (a locked account cannot ask again), but a second code could still be spent: the day stays
        $this->lockAccount('ana@example.com');
        $first = (int) Query::scalar($this->pdo, "SELECT delete_after FROM users WHERE email = 'ana@example.com'");
        $this->pdo->prepare("UPDATE users SET delete_after = ? WHERE email = 'ana@example.com'")->execute([$first - self::DAY_MS]);
        $tokens = new \App\Auth\EmailTokens($this->pdo);
        $userId = (string) Query::scalar($this->pdo, "SELECT id FROM users WHERE email = 'ana@example.com'");
        $code = $tokens->issue($userId, \App\Auth\EmailTokens::DELETE, 3600, (int) (microtime(true) * 1000));

        $this->assertSame(200, $this->call('POST', '/api/account/delete-confirm', ['token' => $code])->getStatusCode());

        $this->assertSame($first - self::DAY_MS, (int) Query::scalar($this->pdo, "SELECT delete_after FROM users WHERE email = 'ana@example.com'"));
    }

    public function testALockedAccountOnlyAnswersWhoItIsAndKeepingIt(): void
    {
        $this->lockAccount('ana@example.com');
        $ana = $this->login('ana@example.com');

        $me = $this->call('GET', '/api/me', null, $ana);

        $this->assertSame(200, $me->getStatusCode(), 'it can sign in: that is how it is offered to keep it');
        $this->assertNotNull($this->body($me)['deleteAfter']);
        foreach ([['GET', '/api/sync?since=0'], ['POST', '/api/sync'], ['GET', '/api/songs/' . self::SONG . '/share'], ['POST', '/api/account/delete-request']] as [$method, $uri]) {
            $response = $this->call($method, $uri, $method === 'GET' ? null : [], $ana);
            $this->assertSame(403, $response->getStatusCode(), $method . ' ' . $uri);
            $this->assertSame('deletion_pending', $this->body($response)['error']);
        }
    }

    public function testKeepingItBringsEverythingBack(): void
    {
        $ana = $this->login('ana@example.com');
        $this->pushSong($ana, 'Canto de Ana');
        $code = $this->shareSong($ana);
        $this->assertSame(200, $this->call('GET', '/api/shared/' . $code)->getStatusCode());
        $this->call('POST', '/api/account/delete-request', [], $ana);
        $this->call('POST', '/api/account/delete-confirm', ['token' => $this->mailer->lastToken('ana@example.com')]);
        $this->assertSame(404, $this->call('GET', '/api/shared/' . $code)->getStatusCode(), 'its link shows nothing while it waits');

        $again = $this->login('ana@example.com');
        $kept = $this->call('POST', '/api/account/keep', [], $again);

        $this->assertSame(200, $kept->getStatusCode());
        $this->assertNull($this->body($this->call('GET', '/api/me', null, $again))['deleteAfter']);
        $songs = $this->body($this->call('GET', '/api/sync?since=0', null, $again))['songs'];
        $this->assertSame(['Canto de Ana'], array_column($songs, 'title'));
        $this->assertSame(200, $this->call('GET', '/api/shared/' . $code)->getStatusCode(), 'and its link works again');
    }

    public function testKeepingNeedsASession(): void
    {
        $this->assertSame(401, $this->call('POST', '/api/account/keep', [])->getStatusCode());
    }

    public function testNothingIsDeletedBeforeThe3DaysAreUp(): void
    {
        $this->lockAccount('ana@example.com');

        $this->call('GET', '/api/health');
        $this->assertSame(0, (new AccountDeletion(
            $this->pdo,
            new \App\Auth\Authenticator($this->pdo),
            new \App\Auth\EmailTokens($this->pdo),
            new \App\Mail\AccountMail($this->mailer, self::SITE)
        ))->purgeDue((int) (microtime(true) * 1000) + 2 * self::DAY_MS));

        $this->assertTrue($this->userExists('ana@example.com'));
    }

    public function testAfter3DaysTheAccountAndEverythingItOwnsIsGoneAndNobodyElsesIsTouched(): void
    {
        $ana = $this->login('ana@example.com');
        $beto = $this->login('beto@example.com');
        $this->pushSong($ana, 'Canto de Ana');
        $this->pushSong($beto, 'Canto de Beto');
        $anaCode = $this->shareSong($ana);
        $betoCode = $this->shareSong($beto);
        (new GoogleAccounts($this->pdo, new \App\Auth\Authenticator($this->pdo), new \App\Auth\EmailTokens($this->pdo)))
            ->signIn(new GoogleIdentity('sub-ana', 'ana@example.com'), 1);
        $this->lockAccount('ana@example.com');
        $this->login('ana@example.com');
        $this->pdo->prepare("UPDATE users SET delete_after = ? WHERE email = 'ana@example.com'")->execute([(int) (microtime(true) * 1000) - 1]);

        // Whoever uses the app next carries the deletion: the host has no cron
        $this->assertSame(200, $this->call('GET', '/api/health')->getStatusCode());

        $this->assertFalse($this->userExists('ana@example.com'));
        foreach (['sessions', 'email_tokens', 'identities', 'shares', 'song_shares', 'songs', 'setlists', 'templates', 'sync_state'] as $table) {
            $this->assertSame(0, (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM ' . $table . ' WHERE user_id NOT IN (SELECT id FROM users)'), $table . ' has nothing of a deleted account');
        }
        $this->assertSame(404, $this->call('GET', '/api/shared/' . $anaCode)->getStatusCode());
        $this->assertSame(401, $this->call('POST', '/api/login', ['email' => 'ana@example.com', 'password' => 'clave larga'])->getStatusCode());
        // Beto, who did nothing, has all he had
        $this->assertTrue($this->userExists('beto@example.com'));
        $this->assertSame(1, $this->rows('songs', 'beto@example.com'));
        $this->assertSame(1, $this->rows('song_shares', 'beto@example.com'));
        $this->assertSame(200, $this->call('GET', '/api/shared/' . $betoCode)->getStatusCode());
        $this->assertSame(['Canto de Beto'], array_column($this->body($this->call('GET', '/api/sync?since=0', null, $beto))['songs'], 'title'));
    }

    public function testTheSameAddressCanSignUpAgainOnceItIsGone(): void
    {
        $this->lockAccount('ana@example.com');
        $this->pdo->prepare("UPDATE users SET delete_after = 1 WHERE email = 'ana@example.com'")->execute();
        $this->call('GET', '/api/health');

        $this->assertFalse($this->userExists('ana@example.com'));
        $this->assertSame(0, (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM identities'));
    }

    public function testMeSaysWhetherTheAccountSignsInWithGoogle(): void
    {
        $this->assertFalse($this->body($this->call('GET', '/api/me', null, $this->login('ana@example.com')))['google']);
        (new GoogleAccounts($this->pdo, new \App\Auth\Authenticator($this->pdo), new \App\Auth\EmailTokens($this->pdo)))
            ->signIn(new GoogleIdentity('sub-beto', 'beto@example.com'), 1);

        $this->assertTrue($this->body($this->call('GET', '/api/me', null, $this->login('beto@example.com')))['google']);
    }
}
