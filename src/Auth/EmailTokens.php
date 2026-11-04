<?php

declare(strict_types=1);

namespace App\Auth;

use PDO;

/**
 * The codes in the links sent by email. A code is 256 random bits; only its hash is kept (like a session's). It
 * works once, for what it was made for, until it expires; asking for another of the same kind cancels the one
 * before.
 */
final class EmailTokens
{
    public const VERIFY = 'verify';
    public const RESET = 'reset';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * A new code for the user. `$ttlSeconds` is how long it lives; `$now` is epoch ms.
     *
     * @param self::VERIFY|self::RESET $purpose
     */
    public function issue(string $userId, string $purpose, int $ttlSeconds, int $now): string
    {
        $this->pdo->prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?')->execute([$userId, $purpose]);
        $this->pdo->prepare('DELETE FROM email_tokens WHERE expires_at <= ?')->execute([$now]);

        $token = bin2hex(random_bytes(32));
        $this->pdo
            ->prepare(
                'INSERT INTO email_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
            )
            ->execute([hash('sha256', $token), $userId, $purpose, $now, $now + $ttlSeconds * 1000]);

        return $token;
    }

    /**
     * Spends the code: the id of the user it was made for, or null when it is not a code, was made for something else,
     * expired or was already used. Two requests with the same code cannot both win.
     *
     * @param self::VERIFY|self::RESET $purpose
     */
    public function consume(string $token, string $purpose, int $now): ?string
    {
        if (preg_match('~^[0-9a-f]{64}$~', $token) !== 1) {
            return null;
        }
        $hash = hash('sha256', $token);
        $statement = $this->pdo->prepare(
            'SELECT user_id FROM email_tokens WHERE token_hash = ? AND purpose = ? AND expires_at > ?'
        );
        $statement->execute([$hash, $purpose, $now]);
        $userId = $statement->fetchColumn();
        if (!is_string($userId)) {
            return null;
        }
        $spent = $this->pdo->prepare('DELETE FROM email_tokens WHERE token_hash = ?');
        $spent->execute([$hash]);

        return $spent->rowCount() === 1 ? $userId : null;
    }

    /** Cancels every code of the user (a new password makes the old links worthless) */
    public function cancelAll(string $userId): void
    {
        $this->pdo->prepare('DELETE FROM email_tokens WHERE user_id = ?')->execute([$userId]);
    }
}
