<?php

declare(strict_types=1);

namespace App\Sync;

use App\Database\Query;
use PDO;

/**
 * The change counter of each user, shared by every kind of record (songs, setlists): a client
 * keeps one cursor and asks "what changed after the last number I saw". Exact where timestamps
 * are not (two changes in one millisecond, a clock set wrong).
 */
final class Sequence
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The latest number given to the user, 0 before the first */
    public function latest(string $userId): int
    {
        return (int) Query::scalar($this->pdo, 'SELECT seq FROM sync_state WHERE user_id = ?', [$userId]);
    }

    /**
     * The next number. Call it inside the transaction that stores the change, so a change that
     * fails to save does not burn a number that a record then lacks.
     */
    public function next(string $userId): int
    {
        $bump = $this->pdo->prepare('UPDATE sync_state SET seq = seq + 1 WHERE user_id = ?');
        $bump->execute([$userId]);
        if ($bump->rowCount() === 0) {
            $this->pdo->prepare('INSERT INTO sync_state (user_id, seq) VALUES (?, 1)')->execute([$userId]);
        }

        return $this->latest($userId);
    }
}
