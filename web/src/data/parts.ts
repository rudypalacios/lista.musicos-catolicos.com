import { ValidationError } from './library.ts';
import { LIMITS, type PartDef, type SetlistItem } from './types.ts';

/**
 * The sections of a list or of a template (`PartDef`), and what is done to them. These are pure functions over the
 * array: a list and a template change their sections through the same ones, so they cannot disagree about what a
 * section is. `cleanParts` is the one that decides whether the result may be kept.
 */

/**
 * Adds a section at the end. With `section` (one of the Mass's, offered when the list does not have it) it keeps its
 * id; with only a name it is the person's own and gets an id made on the device (`p-…`), so renaming it later never
 * orphans its songs.
 */
export function addedTo(parts: readonly PartDef[], name: string, newId: () => string, section?: PartDef): PartDef[] {
    const added: PartDef = section ?? { id: `p-${newId().replace(/-/g, '').slice(0, 8)}`, name };

    return [...parts, added];
}

/** The same sections with one renamed: its id, and so its songs, stay */
export function renamedIn(parts: readonly PartDef[], id: string, name: string): PartDef[] {
    return parts.map((candidate) => (candidate.id === id ? { ...candidate, name } : candidate));
}

/** One place up (−1) or down (1); one at an end stays where it is, and an unknown id changes nothing */
export function movedIn(parts: readonly PartDef[], id: string, direction: -1 | 1): PartDef[] {
    const moved = [...parts];
    const at = moved.findIndex((candidate) => candidate.id === id);
    const to = at + direction;
    if (at === -1 || to < 0 || to >= moved.length) {
        return moved;
    }
    [moved[at], moved[to]] = [moved[to] as PartDef, moved[at] as PartDef];

    return moved;
}

/** Without the section (what holds songs is the caller's to check: it knows the songs) */
export function withoutPart(parts: readonly PartDef[], id: string): PartDef[] {
    return parts.filter((candidate) => candidate.id !== id);
}

/** One section switched off or on, where it is */
export function switchedIn(parts: readonly PartDef[], id: string, off: boolean): PartDef[] {
    return parts.map((candidate) => {
        if (candidate.id !== id) {
            return candidate;
        }
        const { off: _off, ...rest } = candidate;

        return off ? { ...rest, off: true as const } : rest;
    });
}

/** One section marked optional (the slot can be left empty) or not, where it is */
export function optionalIn(parts: readonly PartDef[], id: string, optional: boolean): PartDef[] {
    return parts.map((candidate) => {
        if (candidate.id !== id) {
            return candidate;
        }
        const { optional: _optional, ...rest } = candidate;

        return optional ? { ...rest, optional: true as const } : rest;
    });
}

/** One section with its explanation set; an empty one removes it (`cleanParts` does the same, so it never keeps a blank) */
export function notedIn(parts: readonly PartDef[], id: string, note: string): PartDef[] {
    return parts.map((candidate) => {
        if (candidate.id !== id) {
            return candidate;
        }
        const { note: _note, ...rest } = candidate;

        return note.trim() === '' ? rest : { ...rest, note };
    });
}

/**
 * The sections as they are kept: names trimmed, no empty name or repeated id, at least one that is shown, and none
 * switched off while it holds songs (`items`: a template has none). Says what is wrong in the person's words (it is
 * shown as it is).
 */
export function cleanParts(parts: readonly PartDef[], items: readonly SetlistItem[]): PartDef[] {
    if (parts.length === 0) {
        throw new ValidationError('Hace falta al menos una sección.');
    }
    if (parts.length > LIMITS.parts) {
        throw new ValidationError(`Se admiten hasta ${LIMITS.parts} secciones.`);
    }
    const seen = new Set<string>();
    const clean = parts.map((part): PartDef => {
        const name = part.name.trim();
        if (name === '') {
            throw new ValidationError('Una sección necesita un nombre.');
        }
        if (Array.from(name).length > LIMITS.partName) {
            throw new ValidationError(`El nombre de la sección es demasiado largo (máximo ${LIMITS.partName} caracteres).`);
        }
        if (seen.has(part.id)) {
            throw new ValidationError('Dos secciones tienen el mismo identificador.');
        }
        seen.add(part.id);

        return {
            id: part.id,
            name,
            ...(part.off === true ? { off: true as const } : {}),
            ...(part.optional === true ? { optional: true as const } : {}),
            ...(part.note !== undefined && part.note !== '' ? { note: part.note.slice(0, LIMITS.partNote) } : {}),
        };
    });
    if (clean.every((part) => part.off === true)) {
        throw new ValidationError('Hace falta al menos una sección encendida.');
    }
    for (const item of items) {
        const part = clean.find((candidate) => candidate.id === item.part);
        // A song whose section is unknown already shows apart: not a reason to refuse the change
        if (part?.off === true) {
            throw new ValidationError(`«${part.name}» tiene cantos: quítalos antes de apagarla.`);
        }
    }

    return clean;
}
