<?php

declare(strict_types=1);

namespace App\Share;

use PDO;

/**
 * The links a person gives out to show a setlist, read only, to anyone who has them.
 *
 * A share has a secret code (the link); the list it shows stays the person's own, so what they change in it is what
 * the link shows. The public view says only what a visitor needs to read the list: its title, its sections, its songs
 * in order, each in the key the list has it in and, if the person chose it, the lyrics. Nothing of the account, the
 * notes, the tags or any other list or song leaves here.
 */
final class ShareRepository
{
    /** A list holds at most this many songs (LIMITS.items in the app), so a query has at most this many parameters */
    private const MAX_ITEMS = 80;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * The link of a list while it is shared; null when it is not (or the list is not the user's, or is gone).
     *
     * @return array{code: string, withLyrics: bool}|null
     */
    public function activeFor(string $userId, string $setlistId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT code, with_lyrics FROM shares WHERE user_id = ? AND setlist_id = ? AND revoked_at IS NULL'
        );
        $statement->execute([$userId, $setlistId]);
        $row = $statement->fetch();

        if (!is_array($row)) {
            return null;
        }

        return ['code' => (string) $row['code'], 'withLyrics' => (int) $row['with_lyrics'] === 1];
    }

    /**
     * Shares the list, or changes what an existing share carries (its link stays the same). Null when the list is not
     * the user's, is not on the server yet, or was deleted.
     *
     * @return array{code: string, withLyrics: bool}|null
     */
    public function enable(string $userId, string $setlistId, bool $withLyrics, int $now): ?array
    {
        if (!$this->ownsLiveList($userId, $setlistId)) {
            return null;
        }
        $active = $this->activeFor($userId, $setlistId);
        if ($active !== null) {
            $this->pdo
                ->prepare('UPDATE shares SET with_lyrics = ? WHERE code = ?')
                ->execute([(int) $withLyrics, $active['code']]);

            return ['code' => $active['code'], 'withLyrics' => $withLyrics];
        }

        $code = bin2hex(random_bytes(16));
        $this->pdo
            ->prepare(
                'INSERT INTO shares (code, user_id, setlist_id, with_lyrics, created_at, revoked_at) '
                . 'VALUES (?, ?, ?, ?, ?, NULL)'
            )
            ->execute([$code, $userId, $setlistId, (int) $withLyrics, $now]);

        return ['code' => $code, 'withLyrics' => $withLyrics];
    }

    /** Stops sharing the list: its link stops working at once. Twice is fine. Returns whether the list is the user's */
    public function revoke(string $userId, string $setlistId, int $now): bool
    {
        $this->pdo
            ->prepare('UPDATE shares SET revoked_at = ? WHERE user_id = ? AND setlist_id = ? AND revoked_at IS NULL')
            ->execute([$now, $userId, $setlistId]);

        return $this->ownsList($userId, $setlistId);
    }

    /**
     * What anyone with the code sees; null for a code that was never given, was stopped, or whose list is deleted.
     *
     * @return array{
     *     title: string,
     *     withLyrics: bool,
     *     updatedAt: int,
     *     parts: list<array{id: string, name: string}>,
     *     items: list<array{id: string, part: string, songId: string, transpose: int}>,
     *     songs: list<array{id: string, title: string, author: string, body?: string}>
     * }|null
     */
    public function view(string $code): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT s.user_id, s.with_lyrics, l.id, l.title, l.items, l.parts, l.updated_at FROM shares s '
            . 'JOIN setlists l ON l.id = s.setlist_id AND l.user_id = s.user_id '
            . 'WHERE s.code = ? AND s.revoked_at IS NULL AND l.deleted_at IS NULL'
        );
        $statement->execute([$code]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            return null;
        }

        $withLyrics = (int) $row['with_lyrics'] === 1;
        /** @var list<array<string, mixed>> $stored */
        $stored = json_decode((string) $row['items'], true, 4, JSON_THROW_ON_ERROR);
        /** @var list<array<string, mixed>> $storedParts */
        $storedParts = $row['parts'] === null ? [] : json_decode((string) $row['parts'], true, 4, JSON_THROW_ON_ERROR);

        // Only the sections the list shows, as the owner sees it: a switched-off one is not in the list
        $parts = [];
        foreach ($storedParts as $part) {
            if (($part['off'] ?? false) !== true) {
                $parts[] = ['id' => (string) $part['id'], 'name' => (string) $part['name']];
            }
        }
        $shown = array_column($parts, 'id');

        $items = [];
        foreach (array_slice($stored, 0, self::MAX_ITEMS) as $item) {
            if (in_array((string) $item['part'], $shown, true)) {
                $items[] = [
                    'id' => (string) $item['id'],
                    'part' => (string) $item['part'],
                    'songId' => (string) $item['songId'],
                    'transpose' => (int) $item['transpose'],
                ];
            }
        }

        $songIds = array_values(array_unique(array_column($items, 'songId')));
        $songs = $this->songsOf((string) $row['user_id'], $songIds, $withLyrics);
        $updatedAt = max((int) $row['updated_at'], ...array_column($songs['rows'], 'updatedAt'));
        // An item whose song is gone (deleted) is left out, as the owner's list shows it as deleted
        $items = array_values(array_filter(
            $items,
            static fn (array $item): bool => isset($songs['rows'][$item['songId']])
        ));

        return [
            'title' => (string) $row['title'],
            'withLyrics' => $withLyrics,
            'updatedAt' => $updatedAt,
            'parts' => $parts,
            'items' => $items,
            'songs' => array_values(array_map(static function (array $song): array {
                unset($song['updatedAt']);

                return $song;
            }, $songs['rows'])),
        ];
    }

    private function ownsList(string $userId, string $setlistId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM setlists WHERE id = ? AND user_id = ?');
        $statement->execute([$setlistId, $userId]);

        return $statement->fetchColumn() !== false;
    }

    private function ownsLiveList(string $userId, string $setlistId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM setlists WHERE id = ? AND user_id = ? AND deleted_at IS NULL');
        $statement->execute([$setlistId, $userId]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * The songs of the list the user still has (not deleted), by id. With no lyrics, only the title and the author.
     *
     * @param list<string> $ids
     *
     * @return array{
     *     rows: array<string, array{id: string, title: string, author: string, updatedAt: int, body?: string}>
     * }
     */
    private function songsOf(string $userId, array $ids, bool $withLyrics): array
    {
        if ($ids === []) {
            return ['rows' => []];
        }
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $statement = $this->pdo->prepare(
            'SELECT id, title, author, body, updated_at FROM songs '
            . 'WHERE user_id = ? AND deleted_at IS NULL AND id IN (' . $marks . ')'
        );
        $statement->execute([$userId, ...$ids]);

        $rows = [];
        foreach ($statement->fetchAll() as $song) {
            $id = (string) $song['id'];
            $rows[$id] = [
                'id' => $id,
                'title' => (string) $song['title'],
                'author' => (string) $song['author'],
                'updatedAt' => (int) $song['updated_at'],
            ];
            if ($withLyrics) {
                $rows[$id]['body'] = (string) $song['body'];
            }
        }

        return ['rows' => $rows];
    }
}
