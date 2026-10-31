<?php

declare(strict_types=1);

namespace App\Sync;

use App\Uuid;

/**
 * One template as a client sends it: the sections a new list starts with, under a name ("Misa", "Rosario"). The whole
 * record, stamped with the client's own clock; the newest stamp wins, as with songs and lists. A list takes a copy of
 * the sections when it is made, so a template never reaches into a list that exists.
 */
final class TemplateChange
{
    public const MAX_NAME = 60;
    /** See SongChange::MAX_FUTURE_MS */
    public const MAX_FUTURE_MS = SongChange::MAX_FUTURE_MS;

    /**
     * @param list<array{id: string, name: string, off?: true, optional?: true, note?: string}> $parts
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly array $parts,
        public readonly int $updatedAt,
        public readonly bool $deleted,
    ) {
    }

    /**
     * @param array<mixed> $data
     *
     * @throws InvalidTemplate
     */
    public static function fromArray(array $data, int $nowMs): self
    {
        $id = $data['id'] ?? null;
        if (!is_string($id) || !Uuid::isValid($id)) {
            throw new InvalidTemplate('Una plantilla no tiene un identificador válido.');
        }

        $updatedAt = $data['updatedAt'] ?? null;
        if (!is_int($updatedAt) || $updatedAt < 0) {
            throw new InvalidTemplate('Una plantilla no tiene fecha de edición válida.');
        }
        $updatedAt = min($updatedAt, $nowMs + self::MAX_FUTURE_MS);

        $name = $data['name'] ?? '';
        if (!is_string($name)) {
            throw new InvalidTemplate('El nombre de la plantilla no es válido.');
        }
        $name = trim($name);
        if (mb_strlen($name) > self::MAX_NAME) {
            throw new InvalidTemplate(
                'El nombre de la plantilla es demasiado largo (máximo ' . self::MAX_NAME . ' caracteres).'
            );
        }
        if (($data['deleted'] ?? false) === true) {
            // A tombstone keeps the name and nothing else
            return new self($id, $name, [], $updatedAt, true);
        }
        if ($name === '') {
            throw new InvalidTemplate('La plantilla necesita un nombre.');
        }
        try {
            $parts = Sections::read($data['parts'] ?? null);
        } catch (InvalidSections $e) {
            throw new InvalidTemplate($e->getMessage(), 0, $e);
        }

        return new self($id, $name, $parts, $updatedAt, false);
    }

    public function partsJson(): string
    {
        return Sections::json($this->parts);
    }
}
