import { massTag, plain } from '../mass.ts';
import { ValidationError } from './library.ts';
import { LIMITS, type PartDef, type Setlist, type Song } from './types.ts';

/**
 * Tags on songs: free text, compared without accents or capitals ("Comunión" and "comunion" are one tag), so a
 * slip of the keyboard does not make a second one. A section of a list has a tag too (`tagOf`): the picker of a
 * section offers first the songs that carry it.
 */

/** Whether two tags are the same tag */
export function sameTag(a: string, b: string): boolean {
    return plain(a) === plain(b);
}

/** The tags as they are kept: trimmed, single spaces, none empty or repeated (the first spelling stays), at most `LIMITS.tags` */
export function cleanTags(tags: readonly string[]): string[] {
    const clean: string[] = [];
    for (const raw of tags) {
        const tag = raw.replace(/\s+/g, ' ').trim();
        if (tag === '' || clean.some((have) => sameTag(have, tag))) {
            continue;
        }
        if (Array.from(tag).length > LIMITS.tag) {
            throw new ValidationError(`Una etiqueta admite hasta ${LIMITS.tag} caracteres.`);
        }
        clean.push(tag);
    }
    if (clean.length > LIMITS.tags) {
        throw new ValidationError(`Un canto admite hasta ${LIMITS.tags} etiquetas.`);
    }

    return clean;
}

/** Whether the song carries the tag */
export function hasTag(song: Pick<Song, 'tags'>, tag: string): boolean {
    return song.tags.some((have) => sameTag(have, tag));
}

/**
 * The tag a section of a list asks of the songs: the Mass's sections have a short one ("Entrada" for "Canto de
 * entrada", by their id, so renaming the section leaves it); any other is its own name.
 */
export function tagOf(part: Pick<PartDef, 'id' | 'name'>): string {
    return massTag(part.id) ?? part.name;
}

/** The songs that carry the tag, in the order given */
export function withTag(songs: readonly Song[], tag: string): Song[] {
    return songs.filter((song) => hasTag(song, tag));
}

/**
 * The tags in use, each once (the most common spelling), most used first and then by name: what the person can
 * pick from instead of typing.
 */
export function tagsInUse(songs: readonly Pick<Song, 'tags'>[]): string[] {
    const found = new Map<string, { tag: string; count: number }>();
    for (const song of songs) {
        for (const tag of song.tags) {
            const key = plain(tag);
            const seen = found.get(key);
            found.set(key, { tag: seen?.tag ?? tag, count: (seen?.count ?? 0) + 1 });
        }
    }

    return [...found.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es')).map((entry) => entry.tag);
}

/**
 * The songs the lists already use in a section (`partId`: the Mass's ids are the same in every list, and a template
 * gives the same ids to the lists made from it) that do not carry the section's tag and have room for it: what
 * "Etiquetarlos" would tag. Each song once, by title.
 */
export function untaggedUses(lists: readonly Pick<Setlist, 'items'>[], songs: readonly Song[], partId: string, tag: string): Song[] {
    const used = new Set(lists.flatMap((list) => list.items.filter((item) => item.part === partId).map((item) => item.songId)));

    return songs
        .filter((song) => used.has(song.id) && !hasTag(song, tag) && song.tags.length < LIMITS.tags)
        .sort((a, b) => a.title.localeCompare(b.title, 'es'));
}
