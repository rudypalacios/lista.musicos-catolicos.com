import type { LocalStore } from './store.ts';
import { cleanTags, sameTag } from './tags.ts';
import { LIMITS, type Song } from './types.ts';

/** A song the person wrote that cannot be saved; the message is Spanish and can be shown as is */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export interface SongDraft {
    title: string;
    author: string;
    body: string;
    /** Left out: a new song has none and an edit keeps the ones it has */
    tags?: readonly string[];
}

/**
 * The person's songs on this device: create, edit, delete, list. Everything is written to the
 * local store first (and queued for the server), so it works with no connection.
 */
export class Library {
    private readonly store: LocalStore;
    private readonly now: () => number;
    private readonly newId: () => string;

    constructor(
        store: LocalStore,
        now: () => number = Date.now,
        newId: () => string = () => crypto.randomUUID(),
    ) {
        this.store = store;
        this.now = now;
        this.newId = newId;
    }

    /** The songs that are not deleted, by title (Spanish order: "Ángel" among the A's) */
    async list(): Promise<Song[]> {
        const songs = (await this.store.all('songs')).filter((song) => song.deletedAt === null).map(withDefaults);

        return songs.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    }

    /** A song, or undefined if it does not exist or was deleted */
    async get(id: string): Promise<Song | undefined> {
        const song = await this.store.get('songs', id);

        return song !== undefined && song.deletedAt === null ? withDefaults(song) : undefined;
    }

    async create(draft: SongDraft): Promise<Song> {
        const song: Song = { ...clean(draft), tags: cleanTags(draft.tags ?? []), myShift: 0, id: this.newId(), updatedAt: this.now(), deletedAt: null };
        await this.store.save('songs', song);

        return song;
    }

    /** @throws ValidationError, or Error when the song does not exist */
    async update(id: string, draft: SongDraft): Promise<Song> {
        const current = await this.get(id);
        if (current === undefined) {
            throw new Error('La canción ya no existe.');
        }
        const song: Song = {
            ...current,
            ...clean(draft),
            tags: draft.tags === undefined ? current.tags : cleanTags(draft.tags),
            updatedAt: this.stamp(current),
        };
        await this.store.save('songs', song);

        return song;
    }

    /** Replaces the song's tags; the same tag in another spelling is the same tag. @throws ValidationError */
    async setTags(id: string, tags: readonly string[]): Promise<Song> {
        const current = await this.get(id);
        if (current === undefined) {
            throw new Error('La canción ya no existe.');
        }
        const next = cleanTags(tags);
        if (next.length === current.tags.length && next.every((tag, index) => sameTag(tag, current.tags[index] ?? ''))) {
            return current;
        }
        const song: Song = { ...current, tags: next, updatedAt: this.stamp(current) };
        await this.store.save('songs', song);

        return song;
    }

    /**
     * Adds `tag` to each of the songs that do not carry it and have room for it. Returns the songs it changed (the rest
     * were not touched), so it can be taken off again. @throws ValidationError for a tag that is not valid
     */
    async addTag(ids: readonly string[], tag: string): Promise<Song[]> {
        const changed: Song[] = [];
        for (const id of ids) {
            const current = await this.get(id);
            if (current === undefined || current.tags.some((have) => sameTag(have, tag)) || current.tags.length >= LIMITS.tags) {
                continue;
            }
            changed.push(await this.setTags(id, [...current.tags, tag]));
        }

        return changed;
    }

    /** Takes `tag` off each of the songs that carry it; the other tags stay */
    async removeTag(ids: readonly string[], tag: string): Promise<Song[]> {
        const changed: Song[] = [];
        for (const id of ids) {
            const current = await this.get(id);
            if (current === undefined || !current.tags.some((have) => sameTag(have, tag))) {
                continue;
            }
            changed.push(await this.setTags(id, current.tags.filter((have) => !sameTag(have, tag))));
        }

        return changed;
    }

    /**
     * Sets "mi tono": the key the person sings the song in, in semitones from the written one. A song
     * added to a list from now on starts in it; the lists that already have it keep theirs.
     *
     * @throws ValidationError, or Error when the song does not exist
     */
    async setMyShift(id: string, shift: number): Promise<Song> {
        if (!Number.isInteger(shift) || Math.abs(shift) > LIMITS.transpose) {
            throw new ValidationError('El tono no es válido.');
        }
        const current = await this.get(id);
        if (current === undefined) {
            throw new Error('La canción ya no existe.');
        }
        if (current.myShift === shift) {
            return current;
        }
        const song: Song = { ...current, myShift: shift, updatedAt: this.stamp(current) };
        await this.store.save('songs', song);

        return song;
    }

    async remove(id: string): Promise<void> {
        const current = await this.store.get('songs', id);
        if (current === undefined || current.deletedAt !== null) {
            return;
        }
        const at = this.stamp(current);
        // The lyrics go; the title stays so a tombstone can still be told apart in a pinch
        await this.store.save('songs', { ...current, body: '', updatedAt: at, deletedAt: at });
    }

    /** Strictly after the version it replaces, even if this device's clock is behind */
    private stamp(previous: Song): number {
        return Math.max(this.now(), previous.updatedAt + 1);
    }
}

/** A song saved before "mi tono" or the tags has none: the guard gives it the value they start with */
function withDefaults(song: Song): Song {
    const myShift = Number.isInteger(song.myShift) ? song.myShift : 0;
    const tags = Array.isArray(song.tags) ? song.tags : [];

    return myShift === song.myShift && tags === song.tags ? song : { ...song, myShift, tags };
}

function clean(draft: SongDraft): Pick<SongDraft, 'title' | 'author' | 'body'> {
    const title = draft.title.trim();
    const author = draft.author.trim();
    if (title === '') {
        throw new ValidationError('El canto necesita un título.');
    }
    if (Array.from(title).length > LIMITS.title) {
        throw new ValidationError(`El título es demasiado largo (máximo ${LIMITS.title} caracteres).`);
    }
    if (Array.from(author).length > LIMITS.author) {
        throw new ValidationError(`El autor es demasiado largo (máximo ${LIMITS.author} caracteres).`);
    }
    if (new TextEncoder().encode(draft.body).length > LIMITS.body) {
        throw new ValidationError('La letra es demasiado larga.');
    }

    return { title, author, body: draft.body };
}
