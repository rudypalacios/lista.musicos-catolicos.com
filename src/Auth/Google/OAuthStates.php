<?php

declare(strict_types=1);

namespace App\Auth\Google;

use PDO;

/**
 * The sign-ins with Google that were started and have not come back. Each has a `state` (it travels to Google and back in
 * the address) and a `binding` (it stays in a cookie of the browser that started it): the return only counts when both
 * arrive together, so a link someone else started cannot sign this browser into their account. Only hashes are kept.
 */
final class OAuthStates
{
    public const TTL_SECONDS = 600;
    public const COOKIE_TTL_SECONDS = self::TTL_SECONDS;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Starts one. The ones that expired are deleted here, so the table stays as small as the sign-ins in the last minutes.
     *
     * @return array{state: string, binding: string, verifier: string, nonce: string}
     */
    public function issue(int $now): array
    {
        $this->pdo->prepare('DELETE FROM oauth_states WHERE expires_at <= ?')->execute([$now]);
        $started = [
            'state' => bin2hex(random_bytes(32)),
            'binding' => bin2hex(random_bytes(32)),
            // 43 to 128 characters of the unreserved alphabet (RFC 7636): this is 64
            'verifier' => rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '='),
            'nonce' => bin2hex(random_bytes(16)),
        ];
        $this->pdo
            ->prepare(
                'INSERT INTO oauth_states (state_hash, binding_hash, verifier, nonce, expires_at) '
                . 'VALUES (?, ?, ?, ?, ?)'
            )
            ->execute([
                hash('sha256', $started['state']),
                hash('sha256', $started['binding']),
                $started['verifier'],
                $started['nonce'],
                $now + self::TTL_SECONDS * 1000,
            ]);

        return $started;
    }

    /**
     * Spends the sign-in `state` names, if `binding` is the browser's that started it and it has not expired. It works once:
     * the row is gone after the first try, right or wrong.
     *
     * @return array{verifier: string, nonce: string}|null
     */
    public function consume(string $state, string $binding, int $now): ?array
    {
        if (preg_match('/^[0-9a-f]{64}$/', $state) !== 1) {
            return null;
        }
        $hash = hash('sha256', $state);
        $statement = $this->pdo->prepare(
            'SELECT binding_hash, verifier, nonce, expires_at FROM oauth_states WHERE state_hash = ?'
        );
        $statement->execute([$hash]);
        $row = $statement->fetch();

        $spent = $this->pdo->prepare('DELETE FROM oauth_states WHERE state_hash = ?');
        $spent->execute([$hash]);
        // Two returns with the same state at once: only the one that deleted the row goes on
        if (!is_array($row) || $spent->rowCount() !== 1) {
            return null;
        }
        if ((int) $row['expires_at'] <= $now || !hash_equals((string) $row['binding_hash'], hash('sha256', $binding))) {
            return null;
        }

        return ['verifier' => (string) $row['verifier'], 'nonce' => (string) $row['nonce']];
    }
}
