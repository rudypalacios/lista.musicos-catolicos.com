<?php

declare(strict_types=1);

namespace Tests\Auth;

use App\Auth\Authenticator;
use App\Auth\TooManyAttemptsException;
use PDO;
use PHPUnit\Framework\TestCase;
use Tests\Support\TestDatabase;

final class AuthenticatorTest extends TestCase
{
    private PDO $pdo;
    private Authenticator $auth;

    protected function setUp(): void
    {
        $this->pdo = TestDatabase::migrated();
        $this->auth = new Authenticator($this->pdo);
        $this->auth->seedOwner('Owner@Example.com', 'correct horse', null);
    }

    public function testTheOwnerIsSeededOnlyOnce(): void
    {
        $this->assertFalse($this->auth->seedOwner('other@example.com', 'x', null));
        $this->assertSame('1', (string) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
    }

    public function testASeedWithoutAPasswordCreatesNothing(): void
    {
        $pdo = TestDatabase::migrated();

        $this->assertFalse((new Authenticator($pdo))->seedOwner('a@example.com', null, null));
        $this->assertFalse((new Authenticator($pdo))->seedOwner(null, 'x', null));
    }

    public function testAPrecomputedHashIsStoredAsIs(): void
    {
        $pdo = TestDatabase::migrated();
        $auth = new Authenticator($pdo);
        $hash = password_hash('secret', PASSWORD_DEFAULT);

        $auth->seedOwner('a@example.com', null, $hash);

        $this->assertNotNull($auth->login('a@example.com', 'secret', '1.1.1.1'));
    }

    public function testLoginIgnoresEmailCaseAndSpaces(): void
    {
        $token = $this->auth->login('  owner@example.COM ', 'correct horse', '1.1.1.1');

        $this->assertNotNull($token);
        $this->assertSame('owner@example.com', $this->auth->authenticate($token)?->email);
    }

    public function testOnlyTheHashOfTheTokenIsStored(): void
    {
        $token = $this->auth->login('owner@example.com', 'correct horse', '1.1.1.1');

        $stored = $this->pdo->query('SELECT token_hash FROM sessions')->fetchColumn();
        $this->assertNotSame($token, $stored);
        $this->assertSame(hash('sha256', (string) $token), $stored);
    }

    public function testWrongCredentialsGiveNoToken(): void
    {
        $this->assertNull($this->auth->login('owner@example.com', 'nope', '1.1.1.1'));
        $this->assertNull($this->auth->login('ghost@example.com', 'correct horse', '1.1.1.1'));
    }

    public function testAnExpiredSessionDoesNotAuthenticate(): void
    {
        $token = (string) $this->auth->login('owner@example.com', 'correct horse', '1.1.1.1');
        $this->pdo->exec("UPDATE sessions SET expires_at = '2000-01-01 00:00:00'");

        $this->assertNull($this->auth->authenticate($token));
    }

    public function testLogoutEndsTheSession(): void
    {
        $token = (string) $this->auth->login('owner@example.com', 'correct horse', '1.1.1.1');

        $this->auth->logout($token);

        $this->assertNull($this->auth->authenticate($token));
    }

    public function testAnUnknownTokenDoesNotAuthenticate(): void
    {
        $this->assertNull($this->auth->authenticate('made-up'));
    }

    public function testTooManyFailuresFromOneAddressBlockEvenTheRightPassword(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->auth->login('owner@example.com', 'wrong', '9.9.9.9');
        }

        $this->expectException(TooManyAttemptsException::class);
        $this->auth->login('owner@example.com', 'correct horse', '9.9.9.9');
    }

    public function testAnotherAddressIsNotBlocked(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->auth->login('owner@example.com', 'wrong', '9.9.9.9');
        }

        $this->assertNotNull($this->auth->login('owner@example.com', 'correct horse', '2.2.2.2'));
    }
}
