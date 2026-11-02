<?php

declare(strict_types=1);

namespace App\Sync;

use PDO;

/**
 * The templates of each user: the same rules as SongRepository (the newest stamp wins, a deletion is a tombstone,
 * every stored change takes the next number of the user's counter), over a record that carries its sections as JSON.
 */
final class TemplateRepository
{
    private readonly Sequence $sequence;

    public function __construct(private readonly PDO $pdo)
    {
        $this->sequence = new Sequence($pdo);
    }

    /**
     * Stores a change unless the server already holds an equal or newer one of this user's. A record is the
     * user's own: the same id in another account is another record (the Mass template has a fixed id in all of
     * them). Returns whether it was applied.
     */
    public function apply(string $userId, TemplateChange $change): bool
    {
        $existing = $this->pdo->prepare('SELECT updated_at FROM templates WHERE id = ? AND user_id = ?');
        $existing->execute([$change->id, $userId]);
        $row = $existing->fetch();

        if (is_array($row)) {
            // This very edit again, or an older one: nothing to do
            if ($change->updatedAt <= (int) $row['updated_at']) {
                return false;
            }
        }

        $this->pdo->beginTransaction();
        try {
            $values = [
                $change->name,
                $change->partsJson(),
                $change->updatedAt,
                $change->deleted ? $change->updatedAt : null,
                $this->sequence->next($userId),
            ];
            if (is_array($row)) {
                $this->pdo
                    ->prepare(
                        'UPDATE templates SET name = ?, parts = ?, updated_at = ?, deleted_at = ?, seq = ? '
                        . 'WHERE id = ? AND user_id = ?'
                    )
                    ->execute([...$values, $change->id, $userId]);
            } else {
                $this->pdo
                    ->prepare(
                        'INSERT INTO templates (name, parts, updated_at, deleted_at, seq, id, user_id) '
                        . 'VALUES (?, ?, ?, ?, ?, ?, ?)'
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
     * The templates that changed after `$since`, oldest change first, at most `$limit`.
     *
     * @return list<array{
     *     id: string, name: string,
     *     parts: list<array{id: string, name: string, off?: true, optional?: true, note?: string}>,
     *     updatedAt: int, deletedAt: ?int, seq: int
     * }>
     */
    public function changedSince(string $userId, int $since, int $limit): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, name, parts, updated_at, deleted_at, seq FROM templates '
            . 'WHERE user_id = ? AND seq > ? ORDER BY seq ASC LIMIT ' . max(1, $limit)
        );
        $statement->execute([$userId, $since]);

        $templates = [];
        foreach ($statement->fetchAll() as $row) {
            $templates[] = [
                'id' => (string) $row['id'],
                'name' => (string) $row['name'],
                // Written by partsJson() only: an unreadable value is damage, and says so
                'parts' => json_decode((string) $row['parts'], true, 4, JSON_THROW_ON_ERROR),
                'updatedAt' => (int) $row['updated_at'],
                'deletedAt' => $row['deleted_at'] === null ? null : (int) $row['deleted_at'],
                'seq' => (int) $row['seq'],
            ];
        }

        return $templates;
    }
}
