<?php

declare(strict_types=1);

namespace App\Sync;

use PDO;

/**
 * The setlists of each user: the same rules as SongRepository (the newest stamp wins, a
 * deletion is a tombstone, every stored change takes the next number of the user's counter),
 * over a record that carries its items as JSON.
 */
final class SetlistRepository
{
    private readonly Sequence $sequence;

    public function __construct(private readonly PDO $pdo)
    {
        $this->sequence = new Sequence($pdo);
    }

    /**
     * Stores a change unless the server already holds an equal or newer one (or the id is
     * another user's). Returns whether it was applied.
     */
    public function apply(string $userId, SetlistChange $change): bool
    {
        $existing = $this->pdo->prepare('SELECT user_id, updated_at FROM setlists WHERE id = ?');
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
            $values = [
                $change->title,
                $change->eventDate,
                $change->notes,
                $change->itemsJson(),
                $change->partsJson(),
                $change->updatedAt,
                $change->deleted ? $change->updatedAt : null,
                $this->sequence->next($userId),
            ];
            if (is_array($row)) {
                // No star sent (an older app): keep the one stored
                $this->pdo
                    ->prepare(
                        'UPDATE setlists SET title = ?, event_date = ?, notes = ?, items = ?, parts = ?, '
                        . 'updated_at = ?, deleted_at = ?, seq = ?, starred = COALESCE(?, starred) WHERE id = ?'
                    )
                    ->execute([...$values, $change->starred === null ? null : (int) $change->starred, $change->id]);
            } else {
                $this->pdo
                    ->prepare(
                        'INSERT INTO setlists '
                        . '(title, event_date, notes, items, parts, updated_at, deleted_at, seq, starred, id, user_id) '
                        . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    )
                    ->execute([...$values, (int) ($change->starred ?? false), $change->id, $userId]);
            }
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return true;
    }

    /**
     * The setlists that changed after `$since`, oldest change first, at most `$limit`.
     *
     * @return list<array{
     *     id: string, title: string, eventDate: ?string, notes: string, starred: bool,
     *     items: list<array{id: string, part: string, songId: string, transpose: int, note: string}>,
     *     parts: list<array{id: string, name: string, off?: true, optional?: true, note?: string}>,
     *     updatedAt: int, deletedAt: ?int, seq: int
     * }>
     */
    public function changedSince(string $userId, int $since, int $limit): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, title, event_date, notes, starred, items, parts, updated_at, deleted_at, seq FROM setlists '
            . 'WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ' . max(1, $limit)
        );
        $statement->execute([$userId, $since]);

        $setlists = [];
        foreach ($statement->fetchAll() as $row) {
            $setlists[] = [
                'id' => (string) $row['id'],
                'title' => (string) $row['title'],
                'eventDate' => $row['event_date'] === null ? null : (string) $row['event_date'],
                'notes' => (string) $row['notes'],
                'starred' => (int) $row['starred'] === 1,
                // Written by itemsJson() only: an unreadable value is damage, and says so
                'items' => json_decode((string) $row['items'], true, 4, JSON_THROW_ON_ERROR),
                // A row with no parts (a deleted list, or one older than their column) reads as none
                'parts' => $row['parts'] === null
                    ? []
                    : json_decode((string) $row['parts'], true, 4, JSON_THROW_ON_ERROR),
                'updatedAt' => (int) $row['updated_at'],
                'deletedAt' => $row['deleted_at'] === null ? null : (int) $row['deleted_at'],
                'seq' => (int) $row['seq'],
            ];
        }

        return $setlists;
    }
}
