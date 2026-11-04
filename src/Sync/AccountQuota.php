<?php

declare(strict_types=1);

namespace App\Sync;

use PDO;

/**
 * How much one account may keep on the server. Sign-up is open, so without a ceiling one account could fill the
 * shared host's database. The ceiling is on what the account holds after a push, never on what it sends: a change
 * that does not make the account hold more (a deletion, a shorter text, a record the server already has) always
 * passes, so a person at the limit can always make room, and a client that retries a batch never gets stuck.
 *
 * Two kinds of limit:
 * - **space**: the text of every song, list and template, plus a fixed overhead per row (so rows with almost no
 *   text, deleted ones included, still count). Measured by SQL `LENGTH()`: bytes in MySQL, characters in SQLite (the
 *   tests), which is the same for ASCII and close enough for a ceiling.
 * - **how many** live songs, lists and templates, which is what the person sees ("2,000 songs").
 *
 * A deletion leaves a row behind (the other devices must learn of it), so a person who creates and deletes without
 * end eventually fills the space with those rows. That is a known limit (see TODO.md); nobody does that by hand.
 *
 * The app tells the person when a record is refused for this (`over_quota`, HTTP 400 like any refusal, so the
 * offline queue keeps the record and marks it "rechazado" without blocking the others).
 */
final class AccountQuota
{
    /** 5 MB of text: a library of 2,000 songs of 2 KB is 4 MB; the owner's real data is a small fraction of this */
    public const MAX_BYTES = 5_000_000;
    public const MAX_SONGS = 2000;
    public const MAX_SETLISTS = 1000;
    public const MAX_TEMPLATES = 50;
    /** What a row costs besides its text: ids, stamps, indexes */
    public const ROW_OVERHEAD = 200;

    /** @var array<string, array{size: string, limit: int, noun: string}> */
    private array $tables;

    public function __construct(
        private readonly PDO $pdo,
        private readonly int $maxBytes = self::MAX_BYTES,
        int $maxSongs = self::MAX_SONGS,
        int $maxSetlists = self::MAX_SETLISTS,
        int $maxTemplates = self::MAX_TEMPLATES,
    ) {
        $overhead = (string) self::ROW_OVERHEAD;
        $this->tables = [
            'songs' => [
                'size' => "LENGTH(title) + LENGTH(author) + LENGTH(body) + COALESCE(LENGTH(tags), 0) + $overhead",
                'limit' => $maxSongs,
                'noun' => 'cantos',
            ],
            'setlists' => [
                'size' => "LENGTH(title) + LENGTH(notes) + LENGTH(items) + COALESCE(LENGTH(parts), 0) + $overhead",
                'limit' => $maxSetlists,
                'noun' => 'listados',
            ],
            'templates' => [
                'size' => "LENGTH(name) + LENGTH(parts) + $overhead",
                'limit' => $maxTemplates,
                'noun' => 'plantillas',
            ],
        ];
    }

    /**
     * Whether the account can keep these changes, all of them together (a batch is all or nothing).
     *
     * @param list<SongChange> $songs
     * @param list<SetlistChange> $setlists
     * @param list<TemplateChange> $templates
     *
     * @throws OverQuota
     */
    public function assertRoom(string $userId, array $songs, array $setlists, array $templates): void
    {
        $bytesBefore = 0;
        $live = [];
        foreach ($this->tables as $table => $definition) {
            $statement = $this->pdo->prepare(
                "SELECT COALESCE(SUM({$definition['size']}), 0) AS bytes, "
                . 'COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END), 0) AS live '
                . "FROM $table WHERE user_id = ?"
            );
            $statement->execute([$userId]);
            $row = $statement->fetch();
            $bytesBefore += is_array($row) ? (int) $row['bytes'] : 0;
            $live[$table] = is_array($row) ? (int) $row['live'] : 0;
        }
        $liveBefore = $live;
        $state = ['bytes' => $bytesBefore, 'live' => $live];

        foreach ($songs as $change) {
            $size = strlen($change->title) + strlen($change->author) + ($change->deleted ? 0 : strlen($change->body))
                + strlen($change->tagsJson()) + self::ROW_OVERHEAD;
            $this->step($userId, 'songs', $change, $size, $state);
        }
        foreach ($setlists as $change) {
            $size = strlen($change->title) + strlen($change->notes) + strlen($change->itemsJson())
                + strlen($change->partsJson()) + self::ROW_OVERHEAD;
            $this->step($userId, 'setlists', $change, $size, $state);
        }
        foreach ($templates as $change) {
            $size = strlen($change->name) + strlen($change->partsJson()) + self::ROW_OVERHEAD;
            $this->step($userId, 'templates', $change, $size, $state);
        }
        $live = $state['live'];
        $bytes = $state['bytes'];

        foreach ($this->tables as $table => $definition) {
            if ($live[$table] > $definition['limit'] && $live[$table] > $liveBefore[$table]) {
                throw new OverQuota(sprintf(
                    'Llegaste al límite de %s %s por cuenta. Elimina algunos para poder guardar más; '
                    . 'lo que escribiste sigue en este dispositivo.',
                    number_format($definition['limit'], 0, ',', '.'),
                    $definition['noun'],
                ));
            }
        }
        if ($bytes > $this->maxBytes && $bytes > $bytesBefore) {
            throw new OverQuota(sprintf(
                'Tu cuenta llegó al límite de espacio (%d MB). Elimina cantos o listados que ya no uses; '
                . 'lo que escribiste sigue en este dispositivo.',
                intdiv($this->maxBytes, 1_000_000),
            ));
        }
    }

    /**
     * Updates `$state` to what the account holds after one change: the stored row replaced by the new one, unless the
     * server would ignore the change (an equal or older stamp), which is what `apply()` of the repositories does.
     *
     * @param array{bytes: int, live: array<string, int>} $state
     */
    private function step(
        string $userId,
        string $table,
        SongChange|SetlistChange|TemplateChange $change,
        int $size,
        array &$state
    ): void {
        $statement = $this->pdo->prepare(
            "SELECT updated_at, deleted_at, {$this->tables[$table]['size']} AS size FROM $table "
            . 'WHERE id = ? AND user_id = ?'
        );
        $statement->execute([$change->id, $userId]);
        $row = $statement->fetch();
        if (is_array($row) && $change->updatedAt <= (int) $row['updated_at']) {
            return;
        }
        $oldSize = is_array($row) ? (int) $row['size'] : 0;
        $oldLive = is_array($row) && $row['deleted_at'] === null ? 1 : 0;
        $state['bytes'] += $size - $oldSize;
        $state['live'][$table] += ($change->deleted ? 0 : 1) - $oldLive;
    }
}
