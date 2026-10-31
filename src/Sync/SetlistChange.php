<?php

declare(strict_types=1);

namespace App\Sync;

use App\Uuid;

/**
 * One setlist as a client sends it: the whole record, items included, stamped with the
 * client's own clock. As with songs, the newest stamp wins, and the list is the unit: two
 * devices that edit the same list while apart keep the later edit and lose the other (a
 * personal tool, where that is rare; TODO.md "Known limits").
 *
 * `starred` marks a favourite. A client that predates it sends no value: `null` means "keep what
 * the server has", so an old copy of the app cannot unstar a list by editing it.
 *
 * A list carries its own sections ("parts"): an ordered list of {id, name, off?, optional?, note?}. A list
 * with none is refused (a deleted one carries none). `off` hides a section without deleting it.
 *
 * An item is one song placed in one part of the list:
 * {id, part, songId, transpose, note}. `part` is the id of one of the list's parts; the server checks
 * its shape and not that it exists there, so a section removed on one device never makes another
 * device's pending list fail (the app shows such songs under "Otras secciones").
 */
final class SetlistChange
{
    public const MAX_TITLE = 190;
    public const MAX_NOTES = 2000;
    public const MAX_ITEMS = 80;
    public const MAX_ITEM_NOTE = 500;
    /** Semitones up or down, an octave less one: the same range as the song viewer */
    public const MAX_TRANSPOSE = 11;
    /** Bytes: the column is TEXT (64 KiB) in MySQL */
    public const MAX_ITEMS_JSON = 60000;
    /** See SongChange::MAX_FUTURE_MS */
    public const MAX_FUTURE_MS = SongChange::MAX_FUTURE_MS;

    private const PART = '~^[a-z0-9-]{1,40}$~';
    private const DATE = '~^(\d{4})-(\d{2})-(\d{2})$~';

    /**
     * @param list<array{id: string, part: string, songId: string, transpose: int, note: string}> $items
     * @param list<array{id: string, name: string, off?: true, optional?: true, note?: string}> $parts
     */
    public function __construct(
        public readonly string $id,
        public readonly string $title,
        public readonly ?string $eventDate,
        public readonly string $notes,
        public readonly array $items,
        public readonly int $updatedAt,
        public readonly bool $deleted,
        public readonly ?bool $starred = null,
        public readonly array $parts = [],
    ) {
    }

    /**
     * @param array<mixed> $data
     *
     * @throws InvalidSetlist
     */
    public static function fromArray(array $data, int $nowMs): self
    {
        $id = $data['id'] ?? null;
        if (!is_string($id) || !Uuid::isValid($id)) {
            throw new InvalidSetlist('Un listado no tiene un identificador válido.');
        }

        $updatedAt = $data['updatedAt'] ?? null;
        if (!is_int($updatedAt) || $updatedAt < 0) {
            throw new InvalidSetlist('Un listado no tiene fecha de edición válida.');
        }
        $updatedAt = min($updatedAt, $nowMs + self::MAX_FUTURE_MS);

        $title = self::text($data, 'title', self::MAX_TITLE, 'El título');
        if (($data['deleted'] ?? false) === true) {
            // A tombstone keeps the title and nothing else: the list is gone, and no longer a favourite
            return new self($id, $title, null, '', [], $updatedAt, true, false, []);
        }
        if ($title === '') {
            throw new InvalidSetlist('El listado necesita un título.');
        }

        return new self(
            $id,
            $title,
            self::date($data['eventDate'] ?? null),
            self::text($data, 'notes', self::MAX_NOTES, 'Las notas'),
            self::items($data['items'] ?? null),
            $updatedAt,
            false,
            self::starred($data['starred'] ?? null),
            self::parts($data['parts'] ?? null),
        );
    }

    /** The items as they are stored: JSON, with accents and emoji left as they are */
    public function itemsJson(): string
    {
        return self::encode($this->items);
    }

    /** The parts as they are stored: JSON, with accents left as they are */
    public function partsJson(): string
    {
        return Sections::json($this->parts);
    }

    /** @param list<array<string, mixed>> $items */
    private static function encode(array $items): string
    {
        return json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /**
     * @return list<array{id: string, name: string, off?: true, optional?: true, note?: string}>
     *
     * @throws InvalidSetlist
     */
    private static function parts(mixed $value): array
    {
        try {
            return Sections::read($value);
        } catch (InvalidSections $e) {
            throw new InvalidSetlist($e->getMessage(), 0, $e);
        }
    }

    private static function starred(mixed $value): ?bool
    {
        if ($value !== null && !is_bool($value)) {
            throw new InvalidSetlist('La marca de destacado del listado no es válida.');
        }

        return $value;
    }

    private static function date(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || preg_match(self::DATE, $value, $parts) !== 1) {
            throw new InvalidSetlist('La fecha del listado no es válida.');
        }
        if (!checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) {
            throw new InvalidSetlist('La fecha del listado no es válida.');
        }

        return $value;
    }

    /**
     * @return list<array{id: string, part: string, songId: string, transpose: int, note: string}>
     *
     * @throws InvalidSetlist
     */
    private static function items(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value)) {
            throw new InvalidSetlist('Los cantos del listado no son válidos.');
        }
        if (count($value) > self::MAX_ITEMS) {
            throw new InvalidSetlist('Un listado admite hasta ' . self::MAX_ITEMS . ' cantos.');
        }

        $items = [];
        $seen = [];
        foreach ($value as $raw) {
            $item = self::item($raw);
            if (isset($seen[$item['id']])) {
                throw new InvalidSetlist('Un listado tiene dos cantos con el mismo identificador.');
            }
            $seen[$item['id']] = true;
            $items[] = $item;
        }
        if (strlen(self::encode($items)) > self::MAX_ITEMS_JSON) {
            throw new InvalidSetlist('El listado es demasiado grande: quita algunas notas o cantos.');
        }

        return $items;
    }

    /**
     * @return array{id: string, part: string, songId: string, transpose: int, note: string}
     *
     * @throws InvalidSetlist
     */
    private static function item(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new InvalidSetlist('Un canto del listado no es válido.');
        }
        $id = $raw['id'] ?? null;
        $songId = $raw['songId'] ?? null;
        if (!is_string($id) || !Uuid::isValid($id) || !is_string($songId) || !Uuid::isValid($songId)) {
            throw new InvalidSetlist('Un canto del listado no tiene un identificador válido.');
        }
        $part = $raw['part'] ?? null;
        if (!is_string($part) || preg_match(self::PART, $part) !== 1) {
            throw new InvalidSetlist('Un canto del listado no tiene una parte de la misa válida.');
        }
        $transpose = $raw['transpose'] ?? 0;
        if (!is_int($transpose) || abs($transpose) > self::MAX_TRANSPOSE) {
            throw new InvalidSetlist('El tono de un canto del listado no es válido.');
        }

        return [
            'id' => $id,
            'part' => $part,
            'songId' => $songId,
            'transpose' => $transpose,
            'note' => self::text($raw, 'note', self::MAX_ITEM_NOTE, 'La nota de un canto del listado'),
        ];
    }

    /**
     * @param array<mixed> $data
     *
     * @throws InvalidSetlist
     */
    private static function text(array $data, string $field, int $max, string $name): string
    {
        $value = $data[$field] ?? '';
        if (!is_string($value)) {
            throw new InvalidSetlist($name . ' no es válido.');
        }
        $value = trim($value);
        if (mb_strlen($value) > $max) {
            throw new InvalidSetlist($name . ' es demasiado largo (máximo ' . $max . ' caracteres).');
        }

        return $value;
    }
}
