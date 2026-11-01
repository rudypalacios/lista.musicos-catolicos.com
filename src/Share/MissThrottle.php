<?php

declare(strict_types=1);

namespace App\Share;

use App\Auth\TooManyAttemptsException;
use App\Database\Query;
use PDO;

/**
 * Keeps a page anyone can ask from being used to look for codes: an address that asks for links that do not exist too
 * often has to wait. Only the misses are counted, so reading a real link, however many people do, costs the server
 * no more than the read itself.
 */
final class MissThrottle
{
    private const MAX_MISSES = 30;
    private const WINDOW_MINUTES = 15;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @throws TooManyAttemptsException when this address has missed too often recently */
    public function assertAllowed(string $ip): void
    {
        $since = gmdate('Y-m-d H:i:s', time() - self::WINDOW_MINUTES * 60);
        $this->pdo->prepare('DELETE FROM share_misses WHERE attempted_at < ?')->execute([$since]);

        $misses = (int) Query::scalar($this->pdo, 'SELECT COUNT(*) FROM share_misses WHERE ip = ?', [$ip]);
        if ($misses >= self::MAX_MISSES) {
            throw new TooManyAttemptsException();
        }
    }

    public function record(string $ip): void
    {
        $this->pdo
            ->prepare('INSERT INTO share_misses (ip, attempted_at) VALUES (?, ?)')
            ->execute([$ip, gmdate('Y-m-d H:i:s')]);
    }
}
