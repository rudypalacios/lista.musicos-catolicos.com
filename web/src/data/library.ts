import type { LocalStore } from './store.ts';
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
        const songs = (await this.store.all('songs')).filter((song) => song.deletedAt === null).map(withShift);

        return songs.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }));
    }

    /** A song, or undefined if it does not exist or was deleted */
    async get(id: string): Promise<Song | undefined> {
        const song = await this.store.get('songs', id);

        return song !== undefined && song.deletedAt === null ? withShift(song) : undefined;
    }

    async create(draft: SongDraft): Promise<Song> {
        const song: Song = { ...clean(draft), myShift: 0, id: this.newId(), updatedAt: this.now(), deletedAt: null };
        await this.store.save('songs', song);

        return song;
    }

    /** @throws ValidationError, or Error when the song does not exist */
    async update(id: string, draft: SongDraft): Promise<Song> {
        const current = await this.get(id);
        if (current === undefined) {
            throw new Error('La canción ya no existe.');
        }
        const song: Song = { ...current, ...clean(draft), updatedAt: this.stamp(current) };
        await this.store.save('songs', song);

        return song;
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

/** A song saved by a version of the app that had no "mi tono" has none */
function withShift(song: Song): Song {
    return Number.isInteger(song.myShift) ? song : { ...song, myShift: 0 };
}

function clean(draft: SongDraft): SongDraft {
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
