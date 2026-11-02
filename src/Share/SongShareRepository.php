<?php

declare(strict_types=1);

namespace App\Share;

use PDO;

/**
 * The links a person gives out to show one song, read only, to anyone who has them. It is the list's share
 * (ShareRepository) for a single song: the same secret code, the same stopping, and the same rule of saying as
 * little as possible. What a visitor gets has the shape of a shared list with one section and one song, so the
 * visitor's page reads both with the same code; `kind` tells them apart. The lyrics and chords always go with it: a
 * song without its words shows nothing, so there is no choice to make.
 */
final class SongShareRepository
{
    /** The one section of a shared song; the visitor's page does not show it */
    private const PART_ID = 'song';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** The link of a song while it is shared; null when it is not (or the song is not the user's, or is gone) */
    public function activeFor(string $userId, string $songId): ?string
    {
        $statement = $this->pdo->prepare(
            'SELECT code FROM song_shares WHERE user_id = ? AND song_id = ? AND revoked_at IS NULL'
        );
        $statement->execute([$userId, $songId]);
        $code = $statement->fetchColumn();

        return $code === false ? null : (string) $code;
    }

    /**
     * Shares the song, making its link the first time (asking again gives the same link). Null when the song is not the
     * user's, is not on the server yet, or was deleted.
     */
    public function enable(string $userId, string $songId, int $now): ?string
    {
        if (!$this->ownsLiveSong($userId, $songId)) {
            return null;
        }
        $active = $this->activeFor($userId, $songId);
        if ($active !== null) {
            return $active;
        }

        $code = bin2hex(random_bytes(16));
        $this->pdo
            ->prepare(
                'INSERT INTO song_shares (code, user_id, song_id, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)'
            )
            ->execute([$code, $userId, $songId, $now]);

        return $code;
    }

    /** Stops sharing the song: its link stops working at once. Twice is fine. Returns whether the song is the user's */
    public function revoke(string $userId, string $songId, int $now): bool
    {
        $this->pdo
            ->prepare('UPDATE song_shares SET revoked_at = ? WHERE user_id = ? AND song_id = ? AND revoked_at IS NULL')
            ->execute([$now, $userId, $songId]);
        $statement = $this->pdo->prepare('SELECT 1 FROM songs WHERE id = ? AND user_id = ?');
        $statement->execute([$songId, $userId]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * What anyone with the code sees; null for a code that was never given, was stopped, or whose song is deleted.
     *
     * @return array{
     *     kind: 'song',
     *     title: string,
     *     withLyrics: true,
     *     updatedAt: int,
     *     parts: list<array{id: string, name: string}>,
     *     items: list<array{id: string, part: string, songId: string, transpose: int}>,
     *     songs: list<array{id: string, title: string, author: string, body: string}>
     * }|null
     */
    public function view(string $code): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT g.id, g.title, g.author, g.body, g.updated_at FROM song_shares s '
            . 'JOIN songs g ON g.id = s.song_id AND g.user_id = s.user_id '
            . 'WHERE s.code = ? AND s.revoked_at IS NULL AND g.deleted_at IS NULL'
        );
        $statement->execute([$code]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            return null;
        }
        $id = (string) $row['id'];

        return [
            'kind' => 'song',
            'title' => (string) $row['title'],
            'withLyrics' => true,
            'updatedAt' => (int) $row['updated_at'],
            'parts' => [['id' => self::PART_ID, 'name' => 'Canto']],
            // In the song's own key: the key the person keeps for themselves ("my key") is theirs, not what is shared
            'items' => [['id' => $id, 'part' => self::PART_ID, 'songId' => $id, 'transpose' => 0]],
            'songs' => [[
                'id' => $id,
                'title' => (string) $row['title'],
                'author' => (string) $row['author'],
                'body' => (string) $row['body'],
            ]],
        ];
    }

    /** The title of the song a live link shows, for the preview of the link; null when the link shows nothing */
    public function titleOf(string $code): ?string
    {
        $statement = $this->pdo->prepare(
            'SELECT g.title FROM song_shares s JOIN songs g ON g.id = s.song_id AND g.user_id = s.user_id '
            . 'WHERE s.code = ? AND s.revoked_at IS NULL AND g.deleted_at IS NULL'
        );
        $statement->execute([$code]);
        $title = $statement->fetchColumn();

        return $title === false ? null : (string) $title;
    }

    private function ownsLiveSong(string $userId, string $songId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM songs WHERE id = ? AND user_id = ? AND deleted_at IS NULL');
        $statement->execute([$songId, $userId]);

        return $statement->fetchColumn() !== false;
    }
}
