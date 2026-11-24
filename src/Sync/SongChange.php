<?php

declare(strict_types=1);

namespace App\Sync;

use App\Uuid;

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
    /** "Mi tono" is within an octave of the written key, either way */
    public const MAX_SHIFT = 11;
    /** Tags on a song, and the characters of one */
    public const MAX_TAGS = 8;
    public const MAX_TAG = 30;
    /** The states of a song: a draft is marked in the lists until it is published */
    public const STATUS_DRAFT = 'draft';
    public const STATUS_PUBLISHED = 'published';
    /** Characters of the link to hear the song (the column is VARCHAR(500)) */
    public const MAX_LISTEN_URL = 500;

    public function __construct(
        public readonly string $id,
        public readonly string $title,
        public readonly string $author,
        public readonly string $body,
        public readonly int $updatedAt,
        public readonly bool $deleted,
        /** Semitones from the written key; `null` means the client did not say (an older one): keep what is stored */
        public readonly ?int $myShift = null,
        /**
         * What the song is for; `null` means the client did not say (an older one): keep what is stored
         *
         * @var list<string>|null
         */
        public readonly ?array $tags = null,
        /** `draft` or `published`; `null` means the client did not say (an older one): keep what is stored */
        public readonly ?string $status = null,
        /** A link to hear the original, `https://…`; '' takes it away; `null`: the client did not say (an older one), keep it */
        public readonly ?string $listenUrl = null,
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
        if (!is_string($id) || !Uuid::isValid($id)) {
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
            self::shift($data['myShift'] ?? null),
            self::tags($data['tags'] ?? null),
            self::status($data['status'] ?? null),
            self::listenUrl($data['listenUrl'] ?? null),
        );
    }

    /** The tags as they are stored: JSON, with accents left as they are; "[]" for none */
    public function tagsJson(): string
    {
        return json_encode($this->tags ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /**
     * @return list<string>|null
     *
     * @throws InvalidSong
     */
    private static function tags(mixed $value): ?array
    {
        if ($value === null) {
            return null;
        }
        if (!is_array($value) || !array_is_list($value) || count($value) > self::MAX_TAGS) {
            throw new InvalidSong('Un canto admite hasta ' . self::MAX_TAGS . ' etiquetas.');
        }
        $tags = [];
        foreach ($value as $raw) {
            if (!is_string($raw)) {
                throw new InvalidSong('Una etiqueta no es válida.');
            }
            $tag = trim((string) preg_replace('~\s+~u', ' ', $raw));
            if ($tag === '') {
                throw new InvalidSong('Una etiqueta no puede estar vacía.');
            }
            if (mb_strlen($tag) > self::MAX_TAG) {
                throw new InvalidSong('Una etiqueta admite hasta ' . self::MAX_TAG . ' caracteres.');
            }
            $tags[] = $tag;
        }

        return $tags;
    }

    /**
     * @throws InvalidSong
     */
    private static function status(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if ($value !== self::STATUS_DRAFT && $value !== self::STATUS_PUBLISHED) {
            throw new InvalidSong('El estado del canto no es válido.');
        }

        return $value;
    }

    /**
     * The link is kept as pasted (trimmed): the app only opens it, or builds a player from its video id. It must be a
     * plain https address, so nothing else (a `javascript:` link, markup) is stored where a link is expected.
     *
     * @throws InvalidSong
     */
    private static function listenUrl(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            throw new InvalidSong('El enlace para escuchar no es válido.');
        }
        $url = trim($value);
        if ($url === '') {
            return '';
        }
        if (mb_strlen($url) > self::MAX_LISTEN_URL) {
            throw new InvalidSong(
                'El enlace para escuchar es demasiado largo (máximo ' . self::MAX_LISTEN_URL . ' caracteres).'
            );
        }
        $host = parse_url($url, PHP_URL_HOST);
        // Characters that end a link or open markup are not allowed; a backslash is one of them
        $plain = preg_match('~^https://[^\s<>"\'\\\\]+$~u', $url) === 1;
        if (!$plain || !is_string($host) || $host === '') {
            throw new InvalidSong('El enlace para escuchar debe empezar con https://');
        }

        return $url;
    }

    /**
     * @throws InvalidSong
     */
    private static function shift(mixed $value): ?int
    {
        if ($value === null) {
            return null;
        }
        if (!is_int($value) || abs($value) > self::MAX_SHIFT) {
            throw new InvalidSong('El tono personal no es válido.');
        }

        return $value;
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
