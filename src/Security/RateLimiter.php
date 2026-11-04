<?php

declare(strict_types=1);

namespace App\Security;

use App\Database\Query;
use PDO;

/**
 * "Too often": counts what was asked of an address or an account within a window and says no past a limit. One table
 * (`rate_events`) serves every kind of thing that needs it (sign-ups, password resets, resent confirmations); each call
 * passes its own `kind`, the `subject` it is counted for and its own limit.
 */
final class RateLimiter
{
    /** Nothing is counted for longer than an hour; what is older than a day is gone, whoever it was about */
    private const KEEP_SECONDS = 86400;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** Whether `subject` may do `kind` once more: fewer than `max` times in the last `windowSeconds` */
    public function allows(string $kind, string $subject, int $max, int $windowSeconds, int $now): bool
    {
        // Old events of everyone go, not only of this subject: an address that never returns must not stay
        $this->pdo
            ->prepare('DELETE FROM rate_events WHERE happened_at <= ?')
            ->execute([$now - self::KEEP_SECONDS * 1000]);

        $count = (int) Query::scalar(
            $this->pdo,
            'SELECT COUNT(*) FROM rate_events WHERE kind = ? AND subject = ? AND happened_at > ?',
            [$kind, $subject, $now - $windowSeconds * 1000]
        );

        return $count < $max;
    }

    /** Counts one more `kind` for `subject` */
    public function hit(string $kind, string $subject, int $now): void
    {
        $this->pdo
            ->prepare('INSERT INTO rate_events (kind, subject, happened_at) VALUES (?, ?, ?)')
            ->execute([$kind, $subject, $now]);
    }
}
