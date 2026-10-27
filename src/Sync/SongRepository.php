<?php

declare(strict_types=1);

namespace App\Sync;

use App\Database\Query;
use PDO;

/**
 * The songs of each user, and the changes since a point in time.
 *
 * Every change gets the next number of the user's own counter (`seq`), and a client asks for
 * "what changed after the last number I saw". That is exact where timestamps are not (two
 * changes in one millisecond, a clock set wrong), and the answer is the same page by page.
 */
final class SongRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Stores a change unless the server already holds an equal or newer one (or the id is
     * another user's). Returns whether it was applied.
     */
    public function apply(string $userId, SongChange $change): bool
    {
        $existing = $this->pdo->prepare('SELECT user_id, updated_at FROM songs WHERE id = ?');
        $existing->execute([$change->id]);
        $row = $existing->fetch();

        if (is_array($row)) {
            // Someone else's id, or this very edit again, or an older one: nothing to do
            if ($row['user_id'] !== $userId || $change->updatedAt <= (int) $row['updated_at']) {
                return false;
            }
        }

        $this->pdo->beginTransaction();
        try {
            $seq = $this->nextSeq($userId);
            $values = [
                $change->title,
                $change->author,
                $change->deleted ? '' : $change->body,
                $change->updatedAt,
                $change->deleted ? $change->updatedAt : null,
                $seq,
            ];
            if (is_array($row)) {
                $this->pdo
                    ->prepare(
                        'UPDATE songs SET title = ?, author = ?, body = ?, updated_at = ?, deleted_at = ?, seq = ? '
                        . 'WHERE id = ?'
                    )
                    ->execute([...$values, $change->id]);
            } else {
                $this->pdo
                    ->prepare(
                        'INSERT INTO songs (title, author, body, updated_at, deleted_at, seq, id, user_id) '
                        . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                    )
                    ->execute([...$values, $change->id, $userId]);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /**
     * The songs that changed after `$since`, oldest change first, at most `$limit`.
     *
     * @return list<array{
     *     id: string, title: string, author: string, body: string,
     *     updatedAt: int, deletedAt: ?int, seq: int
     * }>
     */
    public function changedSince(string $userId, int $since, int $limit): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, title, author, body, updated_at, deleted_at, seq FROM songs '
            . 'WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ' . max(1, $limit)
        );
        $statement->execute([$userId, $since]);

        $songs = [];
        foreach ($statement->fetchAll() as $row) {
            $songs[] = [
                'id' => (string) $row['id'],
                'title' => (string) $row['title'],
                'author' => (string) $row['author'],
                'body' => (string) $row['body'],
                'updatedAt' => (int) $row['updated_at'],
                'deletedAt' => $row['deleted_at'] === null ? null : (int) $row['deleted_at'],
                'seq' => (int) $row['seq'],
            ];
        }

        return $songs;
    }

    /** The latest change number of the user, 0 before the first */
    public function latestSeq(string $userId): int
    {
        return (int) Query::scalar($this->pdo, 'SELECT seq FROM sync_state WHERE user_id = ?', [$userId]);
    }

    private function nextSeq(string $userId): int
    {
        $bump = $this->pdo->prepare('UPDATE sync_state SET seq = seq + 1 WHERE user_id = ?');
        $bump->execute([$userId]);
        if ($bump->rowCount() === 0) {
            $this->pdo->prepare('INSERT INTO sync_state (user_id, seq) VALUES (?, 1)')->execute([$userId]);
        }

        return $this->latestSeq($userId);
    }
}
