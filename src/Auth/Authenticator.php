<?php

declare(strict_types=1);

namespace App\Auth;

use App\Database\Query;
use App\Uuid;
use PDO;

/**
 * Password login with server-side sessions.
 *
 * The browser keeps a random token in a cookie; only its SHA-256 is stored, so a leaked
 * database cannot be used to sign in. PHP's own sessions are not used: on shared hosting
 * their files are purged after minutes, and this app wants a login that lasts months.
 */
final class Authenticator
{
    public const SESSION_DAYS = 180;
    private const MAX_FAILURES = 10;
    private const WINDOW_MINUTES = 15;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @return string|null the session token for the cookie, or null when the credentials are wrong
     *
     * @throws TooManyAttemptsException when this address has failed too often recently
     */
    public function login(string $email, string $password, string $ip): ?string
    {
        $this->assertNotThrottled($ip);

        $statement = $this->pdo->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
        $statement->execute([strtolower(trim($email))]);
        $row = $statement->fetch();

        // Verify even when the user does not exist, so timing does not reveal which emails are real
        $hash = is_array($row) ? (string) $row['password_hash'] : password_hash('no-user', PASSWORD_DEFAULT);
        if (!password_verify($password, $hash) || !is_array($row)) {
            $this->recordFailure($ip);

            return null;
        }

        return $this->startSession((string) $row['id']);
    }

    /** Opens a session for the user and returns the token for the cookie (only its hash is kept) */
    public function startSession(string $userId): string
    {
        $token = bin2hex(random_bytes(32));
        $this->pdo
            ->prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([
                hash('sha256', $token),
                $userId,
                gmdate('Y-m-d H:i:s'),
                gmdate('Y-m-d H:i:s', time() + self::SESSION_DAYS * 86400),
            ]);

        return $token;
    }

    /** Ends every session of the user, on every device (a new password does it: whoever had the old one is out) */
    public function endAllSessions(string $userId): void
    {
        $this->pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
    }

    public function authenticate(string $token): ?User
    {
        $statement = $this->pdo->prepare(
            'SELECT u.id, u.email, u.email_verified_at FROM sessions s JOIN users u ON u.id = s.user_id '
            . 'WHERE s.token_hash = ? AND s.expires_at > ?'
        );
        $statement->execute([hash('sha256', $token), gmdate('Y-m-d H:i:s')]);
        $row = $statement->fetch();

        return is_array($row)
            ? new User((string) $row['id'], (string) $row['email'], $row['email_verified_at'] !== null)
            : null;
    }

    public function logout(string $token): void
    {
        $this->pdo->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    }

    /** Creates the owner when the database has no users yet; does nothing otherwise */
    public function seedOwner(?string $email, ?string $password, ?string $passwordHash): bool
    {
        $count = Query::scalar($this->pdo, 'SELECT COUNT(*) FROM users');
        if ((int) $count > 0 || $email === null) {
            return false;
        }
        $hash = $passwordHash ?? ($password !== null ? password_hash($password, PASSWORD_DEFAULT) : null);
        if ($hash === null) {
            return false;
        }

        $this->pdo
            ->prepare(
                'INSERT INTO users (id, email, password_hash, created_at, email_verified_at) VALUES (?, ?, ?, ?, ?)'
            )
            // The owner is who set the server up: their address needs no link to be believed
            ->execute([Uuid::v4(), strtolower($email), $hash, gmdate('Y-m-d H:i:s'), (int) (microtime(true) * 1000)]);

        return true;
    }

    private function assertNotThrottled(string $ip): void
    {
        $since = gmdate('Y-m-d H:i:s', time() - self::WINDOW_MINUTES * 60);
        $this->pdo->prepare('DELETE FROM login_attempts WHERE attempted_at < ?')->execute([$since]);

        $failures = (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM login_attempts WHERE ip = ?', [$ip]);
        if ($failures >= self::MAX_FAILURES) {
            throw new TooManyAttemptsException();
        }
    }

    private function recordFailure(string $ip): void
    {
        $this->pdo
            ->prepare('INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)')
            ->execute([$ip, gmdate('Y-m-d H:i:s')]);
    }
}
