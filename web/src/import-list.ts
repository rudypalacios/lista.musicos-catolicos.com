/**
 * Making a list from an import: which songs of the review go in it and in which section. Pure, so it is tested without a screen.
 *
 * A row of the review is one song of the file. A row the person marked is saved as a new song; one they already have ("Ya la tienes")
 * and a repeat of an earlier one start unmarked and, left so, stand for the song that is already there (the person's own, or the
 * first of the repeats); a row the person unmarked on purpose is out of everything.
 */
import { sameTag, tagOf } from './data/tags.ts';
import type { PartDef } from './data/types.ts';

/** What the review knows about a row */
export interface ImportRow {
    /** The person marked it: it is saved as a new song */
    included: boolean;
    /** The id of the song the person already has that this is ("Ya la tienes"), or null */
    heldId: string | null;
    /** The place of the first identical row of the import; its own place when it is the first */
    sameAs: number;
    /** What the row is tagged with now (the part its header named, until the person changes it) */
    tags: readonly string[];
}

/** A row that goes in the list, and what decides its section */
export interface Entry {
    /** The place of its row */
    row: number;
    tags: readonly string[];
}

/** A song of the list in its section */
export interface Placement<K> {
    part: string;
    key: K;
}

/**
 * The rows that go in the list, in the order of the file. A marked row does; one the person already has does; a repeat does
 * when the row it repeats does. A row unmarked on purpose does not.
 */
export function entriesOf(rows: readonly ImportRow[]): Entry[] {
    const goes = (index: number, depth = 0): boolean => {
        const row = rows[index];
        if (row === undefined || depth > rows.length) {
            return false;
        }

        return row.included || row.heldId !== null || (row.sameAs !== index && goes(row.sameAs, depth + 1));
    };

    return rows.flatMap((row, index) => (goes(index) ? [{ row: index, tags: row.tags }] : []));
}

/**
 * Where each entry goes in the sections of a template: the section whose tag (`tagOf`) is one of the entry's tags. A template with
 * one section (a blank list) takes everything, in the order of the file. What fits nowhere is left out. The same song twice in a
 * section is placed once (`same` says whether two rows are the same song).
 */
export function planPlacements(
    entries: readonly Entry[],
    sections: readonly PartDef[],
    same: (a: number, b: number) => boolean = (a, b) => a === b,
): { placed: Placement<number>[]; leftOut: Entry[] } {
    const shown = sections.filter((section) => section.off !== true);
    const placed: Placement<number>[] = [];
    const leftOut: Entry[] = [];
    for (const entry of entries) {
        const home = shown.length === 1
            ? shown[0]
            : shown.find((section) => entry.tags.some((tag) => sameTag(tag, tagOf(section))));
        if (home === undefined) {
            leftOut.push(entry);
        } else if (!placed.some((other) => other.part === home.id && same(other.key, entry.row))) {
            placed.push({ part: home.id, key: entry.row });
        }
    }

    return { placed, leftOut };
}

/** What the notice says once the list is made: how many songs it has and how many did not fit any section */
export function armedMessage(songs: number, leftOut: number): string {
    const base = `Listado armado con ${songs} ${songs === 1 ? 'canto' : 'cantos'}.`;
    if (leftOut === 0) {
        return base;
    }

    return `${base} ${leftOut} no ${leftOut === 1 ? 'encajó' : 'encajaron'} en ninguna sección y ${leftOut === 1 ? 'quedó' : 'quedaron'} solo en Cantos.`;
}
