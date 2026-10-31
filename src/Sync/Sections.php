<?php

declare(strict_types=1);

namespace App\Sync;

/**
 * The sections of a list or a template: an ordered list of {id, name, off?, optional?, note?} (web/src/data/types.ts,
 * `PartDef`). `off` hides a section without deleting it. Read here once for both, so a template and a list cannot
 * disagree about what a section is.
 */
final class Sections
{
    public const MAX = 30;
    public const MAX_NAME = 60;
    public const MAX_NOTE = 300;
    /** Bytes as stored: their own column, so they take nothing from a list's items */
    public const MAX_JSON = 8000;

    private const ID = '~^[a-z0-9-]{1,40}$~';

    /**
     * @return list<array{id: string, name: string, off?: true, optional?: true, note?: string}>
     *
     * @throws InvalidSections
     */
    public static function read(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value) || $value === []) {
            throw new InvalidSections('Hace falta al menos una sección.');
        }
        if (count($value) > self::MAX) {
            throw new InvalidSections('Se admiten hasta ' . self::MAX . ' secciones.');
        }

        $parts = [];
        $seen = [];
        foreach ($value as $raw) {
            $part = self::part($raw);
            if (isset($seen[$part['id']])) {
                throw new InvalidSections('Hay dos secciones con el mismo identificador.');
            }
            $seen[$part['id']] = true;
            $parts[] = $part;
        }
        if (strlen(self::json($parts)) > self::MAX_JSON) {
            throw new InvalidSections('Las secciones son demasiado grandes.');
        }

        return $parts;
    }

    /**
     * The sections as they are stored: JSON, with accents left as they are
     *
     * @param list<array<string, mixed>> $parts
     */
    public static function json(array $parts): string
    {
        return json_encode($parts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /**
     * @return array{id: string, name: string, off?: true, optional?: true, note?: string}
     *
     * @throws InvalidSections
     */
    private static function part(mixed $raw): array
    {
        if (!is_array($raw)) {
            throw new InvalidSections('Una sección no es válida.');
        }
        $id = $raw['id'] ?? null;
        if (!is_string($id) || preg_match(self::ID, $id) !== 1) {
            throw new InvalidSections('Una sección no tiene un identificador válido.');
        }
        $name = self::text($raw, 'name', self::MAX_NAME, 'El nombre de una sección');
        if ($name === '') {
            throw new InvalidSections('Una sección necesita un nombre.');
        }

        $part = ['id' => $id, 'name' => $name];
        foreach (['off', 'optional'] as $flag) {
            $set = $raw[$flag] ?? null;
            if ($set !== null && !is_bool($set)) {
                throw new InvalidSections('Una sección tiene una marca que no es válida.');
            }
            if ($set === true) {
                $part[$flag] = true;
            }
        }
        $note = self::text($raw, 'note', self::MAX_NOTE, 'La nota de una sección');
        if ($note !== '') {
            $part['note'] = $note;
        }

        return $part;
    }

    /**
     * @param array<mixed> $data
     *
     * @throws InvalidSections
     */
    private static function text(array $data, string $field, int $max, string $name): string
    {
        $value = $data[$field] ?? '';
        if (!is_string($value)) {
            throw new InvalidSections($name . ' no es válido.');
        }
        $value = trim($value);
        if (mb_strlen($value) > $max) {
            throw new InvalidSections($name . ' es demasiado largo (máximo ' . $max . ' caracteres).');
        }

        return $value;
    }
}
