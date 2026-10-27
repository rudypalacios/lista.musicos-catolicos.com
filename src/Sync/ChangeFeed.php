<?php

declare(strict_types=1);

namespace App\Sync;

/**
 * What changed for a user after a change number, across every kind of record, in pages.
 *
 * Songs and setlists share one counter, so their numbers never repeat for a user and one
 * cursor serves both. A page is the first `$size` changes by number: each table is asked for
 * `$size + 1` rows (enough to fill the page whichever table holds them, and to know whether
 * more are left), the rows are merged by number and cut.
 */
final class ChangeFeed
{
    public function __construct(
        private readonly SongRepository $songs,
        private readonly SetlistRepository $setlists,
    ) {
    }

    /**
     * @return array{
     *     songs: list<array<string, mixed>>,
     *     setlists: list<array<string, mixed>>,
     *     cursor: int,
     *     hasMore: bool
     * }
     */
    public function page(string $userId, int $since, int $size): array
    {
        $changes = [];
        foreach ($this->songs->changedSince($userId, $since, $size + 1) as $song) {
            $changes[$song['seq']] = ['songs', $song];
        }
        foreach ($this->setlists->changedSince($userId, $since, $size + 1) as $setlist) {
            $changes[$setlist['seq']] = ['setlists', $setlist];
        }
        ksort($changes);

        $hasMore = count($changes) > $size;
        $page = array_slice($changes, 0, $size, true);

        $result = ['songs' => [], 'setlists' => [], 'cursor' => $since, 'hasMore' => $hasMore];
        foreach ($page as $seq => [$kind, $record]) {
            $result[$kind][] = $record;
            $result['cursor'] = $seq;
        }

        return $result;
    }
}
