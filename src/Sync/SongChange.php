<?php

declare(strict_types=1);

namespace App\Sync;

/**
 * One song as a client sends it: the whole record, stamped with the client's own clock. The
 * newest stamp wins (SongRepository), so an edit made offline on one device never overwrites a
 * later edit made on another when it finally syncs.
 */
final class SongChange
{
    public const MAX_TITLE = 190;
    public const MAX_AUTHOR = 190;
    /** Bytes: the column is TEXT (64 KiB) in MySQL */
    public const MAX_BODY = 60000;
    /** A clock this far ahead is wrong; its stamp is pulled back so it cannot win forever */
    public const MAX_FUTURE_MS = 300000;

    private const UUID = '~^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$~';

    public function __construct(
        public readonly string $id,
        public readonly string $title,
        public readonly string $author,
        public readonly string $body,
        public readonly int $updatedAt,
        public readonly bool $deleted,
    ) {
    }

    /**
     * @param array<mixed> $data
     *
     * @throws InvalidSong
     */
    public static function fromArray(array $data, int $nowMs): self
    {
        $id = $data['id'] ?? null;
        if (!is_string($id) || preg_match(self::UUID, $id) !== 1) {
            throw new InvalidSong('Un canto no tiene un identificador válido.');
        }

        $deleted = ($data['deleted'] ?? false) === true;
        $title = self::text($data, 'title', self::MAX_TITLE, 'El título');
        if (!$deleted && $title === '') {
            throw new InvalidSong('El canto necesita un título.');
        }
        $body = $data['body'] ?? '';
        if (!is_string($body) || strlen($body) > self::MAX_BODY) {
            throw new InvalidSong('La letra es demasiado larga.');
        }

        $updatedAt = $data['updatedAt'] ?? null;
        if (!is_int($updatedAt) || $updatedAt < 0) {
            throw new InvalidSong('Un canto no tiene fecha de edición válida.');
        }

        return new self(
            $id,
            $title,
            self::text($data, 'author', self::MAX_AUTHOR, 'El autor'),
            $body,
            min($updatedAt, $nowMs + self::MAX_FUTURE_MS),
            $deleted,
        );
    }

    /**
     * @param array<mixed> $data
     */
    private static function text(array $data, string $field, int $max, string $name): string
    {
        $value = $data[$field] ?? '';
        if (!is_string($value)) {
            throw new InvalidSong($name . ' no es válido.');
        }
        $value = trim($value);
        if (mb_strlen($value) > $max) {
            throw new InvalidSong($name . ' es demasiado largo (máximo ' . $max . ' caracteres).');
        }

        return $value;
    }
}
