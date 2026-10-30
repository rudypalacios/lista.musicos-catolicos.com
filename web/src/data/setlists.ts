import { isValidDate, shortDate, today } from '../dates.ts';
import { MASS_PARTS } from '../mass.ts';
import { ValidationError } from './library.ts';
import type { LocalStore } from './store.ts';
import { nearestShift } from '../keys.ts';
import { LIMITS, type Setlist, type SetlistItem } from './types.ts';

/** What the person edits in the header of a list */
export interface SetlistDraft {
    title: string;
    /** `YYYY-MM-DD`, or null for a list with no date */
    eventDate: string | null;
    notes: string;
}

// --- reading a list ----------------------------------------------------------------------

/** Where a part stands in the Missal; a part this version does not know goes last, never lost */
export function partIndex(part: string): number {
    const index = MASS_PARTS.findIndex((candidate) => candidate.id === part);

    return index === -1 ? MASS_PARTS.length : index;
}

/** The items in the order of the Mass: by part, and within a part in the order they were added */
export function inMassOrder(items: readonly SetlistItem[]): SetlistItem[] {
    // Array.prototype.sort is stable: items of one part keep their order
    return [...items].sort((a, b) => partIndex(a.part) - partIndex(b.part));
}

/** The items of one part, in order */
export function itemsOfPart(items: readonly SetlistItem[], part: string): SetlistItem[] {
    return items.filter((item) => item.part === part);
}

/** Whether the item can go up or down among the items of its own part (the first cannot go up, the last down) */
export function moveOptions(items: readonly SetlistItem[], itemId: string): { up: boolean; down: boolean } {
    const item = items.find((candidate) => candidate.id === itemId);
    if (item === undefined) {
        return { up: false, down: false };
    }
    const siblings = itemsOfPart(items, item.part);
    const at = siblings.findIndex((candidate) => candidate.id === itemId);

    return { up: at > 0, down: at < siblings.length - 1 };
}

/** 1-based place of the item in the order of the Mass, which is how singing names a song; 0 if it is not there */
export function positionInMass(items: readonly SetlistItem[], itemId: string): number {
    return inMassOrder(items).findIndex((item) => item.id === itemId) + 1;
}

/** The title a new list gets: the person renames it if they like */
export function defaultTitle(eventDate: string): string {
    return `Misa del ${shortDate(eventDate)}`;
}

/**
 * Most recently edited first. Not by the day of the Mass: a list may be for a rosary or a
 * prayer meeting and have no day at all.
 */
export function recentFirst(a: Setlist, b: Setlist): number {
    return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
}

/**
 * The lists as the screen shows them: the starred ones (by title, so they stay where the
 * person left them) and the rest (most recently edited first).
 */
export function splitStarred(lists: readonly Setlist[]): { starred: Setlist[]; others: Setlist[] } {
    return {
        starred: lists.filter((list) => list.starred).sort((a, b) => a.title.localeCompare(b.title, 'es') || a.id.localeCompare(b.id)),
        others: lists.filter((list) => !list.starred).sort(recentFirst),
    };
}

// --- writing ------------------------------------------------------------------------------

/**
 * The person's setlists on this device: create, edit, delete, and change what is in a list.
 * Like the library, everything goes to the local store first (queued for the server), so it
 * works with no connection.
 *
 * Every change reads the list, changes it and writes it back, and those steps are queued one
 * after another: two quick taps on "+" must both count, not race and lose one.
 */
export class Setlists {
    private readonly store: LocalStore;
    private readonly afterWrite: () => void;
    private readonly now: () => number;
    private readonly newId: () => string;
    private tail: Promise<unknown> = Promise.resolve();

    /** @param afterWrite called once a change is saved (the app refreshes and syncs) */
    constructor(
        store: LocalStore,
        afterWrite: () => void = () => undefined,
        now: () => number = Date.now,
        newId: () => string = () => crypto.randomUUID(),
    ) {
        this.store = store;
        this.afterWrite = afterWrite;
        this.now = now;
        this.newId = newId;
    }

    /** The lists that are not deleted, most recently edited first */
    async list(): Promise<Setlist[]> {
        const lists = (await this.store.all('setlists')).filter((list) => list.deletedAt === null);

        return lists.sort(recentFirst);
    }

    /** A list, or undefined if it does not exist or was deleted */
    async get(id: string): Promise<Setlist | undefined> {
        const list = await this.store.get('setlists', id);

        return list !== undefined && list.deletedAt === null ? list : undefined;
    }

    /** The lists that use a song, so deleting it can warn first */
    async using(songId: string): Promise<Setlist[]> {
        return (await this.list()).filter((list) => list.items.some((item) => item.songId === songId));
    }

    /** A new, empty list; with nothing given, for today */
    async create(draft: Partial<SetlistDraft> = {}): Promise<Setlist> {
        const eventDate = draft.eventDate === undefined ? today(new Date(this.now())) : draft.eventDate;
        const list: Setlist = {
            id: this.newId(),
            ...cleanDraft({
                title: draft.title ?? (eventDate === null ? 'Misa' : defaultTitle(eventDate)),
                eventDate,
                notes: draft.notes ?? '',
            }),
            starred: false,
            items: [],
            updatedAt: this.now(),
            deletedAt: null,
        };
        await this.store.save('setlists', list);
        this.afterWrite();

        return list;
    }

    /**
     * A copy of a list, for today: the songs in their parts and order, each in the key the list has it in. It has
     * the title of a new list, no star and no notes; a song that was deleted since is left out.
     */
    duplicate(id: string): Promise<Setlist> {
        return this.serial(async () => {
            const source = await this.store.get('setlists', id);
            if (source === undefined || source.deletedAt !== null) {
                throw new Error('El listado ya no existe.');
            }
            const items: SetlistItem[] = [];
            for (const item of source.items) {
                const song = await this.store.get('songs', item.songId);
                if (song !== undefined && song.deletedAt === null) {
                    items.push({ id: this.newId(), part: item.part, songId: item.songId, transpose: item.transpose, note: '' });
                }
            }
            const eventDate = today(new Date(this.now()));
            const copy: Setlist = {
                id: this.newId(),
                ...cleanDraft({ title: defaultTitle(eventDate), eventDate, notes: '' }),
                starred: false,
                items,
                updatedAt: this.now(),
                deletedAt: null,
            };
            await this.store.save('setlists', copy);
            this.afterWrite();

            return copy;
        });
    }

    /** @throws ValidationError (as a rejected promise, like every other change) */
    async update(id: string, draft: SetlistDraft): Promise<Setlist> {
        const clean = cleanDraft(draft);

        return this.edit(id, () => clean);
    }

    /** Stars the list (it goes to the top of the lists screen) or takes the star off; syncs like any edit */
    setStarred(id: string, starred: boolean): Promise<Setlist> {
        return this.edit(id, () => ({ starred }));
    }

    /** Deletes the list; the deletion syncs like any edit */
    async remove(id: string): Promise<void> {
        await this.serial(async () => {
            const current = await this.store.get('setlists', id);
            if (current === undefined || current.deletedAt !== null) {
                return;
            }
            const at = this.stamp(current);
            await this.store.save('setlists', { ...current, notes: '', starred: false, items: [], updatedAt: at, deletedAt: at });
            this.afterWrite();
        });
    }

    /** Adds the song at the end of the part. @throws ValidationError (as a rejected promise) */
    addItem(id: string, part: string, songId: string): Promise<Setlist> {
        return this.edit(id, async (list) => {
            if (!MASS_PARTS.some((candidate) => candidate.id === part)) {
                throw new ValidationError('Esa parte de la misa no existe.');
            }
            const song = await this.store.get('songs', songId);
            if (song === undefined || song.deletedAt !== null) {
                throw new ValidationError('La canción ya no existe.');
            }
            if (list.items.length >= LIMITS.items) {
                throw new ValidationError(`Un listado admite hasta ${LIMITS.items} cantos.`);
            }

            // The song starts in the key its owner sings it in (copied: changing "mi tono" later leaves this list alone)
            const shift = Number.isInteger(song.myShift) ? song.myShift : 0;

            return { items: [...list.items, { id: this.newId(), part, songId, transpose: shift, note: '' }] };
        });
    }

    removeItem(id: string, itemId: string): Promise<Setlist> {
        return this.editItems(id, (items) => items.filter((item) => item.id !== itemId));
    }

    /**
     * Puts back an item that was just removed, at the place it had among the list's items (the undo of
     * "Quitar"). An item that is already there is left alone, so a repeated undo changes nothing.
     */
    restoreItem(id: string, item: SetlistItem, index: number): Promise<Setlist> {
        return this.editItems(id, (items) => {
            if (items.some((candidate) => candidate.id === item.id)) {
                return items;
            }
            if (items.length >= LIMITS.items) {
                throw new ValidationError(`Un listado admite hasta ${LIMITS.items} cantos.`);
            }
            const at = Math.min(Math.max(index, 0), items.length);

            return [...items.slice(0, at), item, ...items.slice(at)];
        });
    }

    /** Moves the item one place up (−1) or down (1) among the items of its own part */
    moveItem(id: string, itemId: string, direction: -1 | 1): Promise<Setlist> {
        return this.editItems(id, (items) => {
            const moved = items.find((item) => item.id === itemId);
            if (moved === undefined) {
                return items;
            }
            const siblings = itemsOfPart(items, moved.part);
            const neighbour = siblings[siblings.indexOf(moved) + direction];
            if (neighbour === undefined) {
                return items;
            }

            return items.map((item) => (item === moved ? neighbour : item === neighbour ? moved : item));
        });
    }

    /**
     * The key a song is written in moved by `moved` semitones (the chart was corrected): every use of it in a
     * list moves the other way, so each sounds as it did. Returns the items it touched.
     */
    async retuneSong(songId: string, moved: number): Promise<{ setlistId: string; itemId: string }[]> {
        const touched: { setlistId: string; itemId: string }[] = [];
        for (const list of await this.using(songId)) {
            await this.editItems(list.id, (items) => items.map((item) => {
                if (item.songId !== songId) {
                    return item;
                }
                touched.push({ setlistId: list.id, itemId: item.id });

                return { ...item, transpose: nearestShift(item.transpose - moved) };
            }));
        }

        return touched;
    }

    /** Raises or lowers the key of this use of the song by `delta` semitones, around the octave */
    shiftItem(id: string, itemId: string, delta: number): Promise<Setlist> {
        return this.editItems(id, (items) =>
            items.map((item) => (item.id === itemId ? { ...item, transpose: wrap(item.transpose + delta) } : item)),
        );
    }

    /** Sets the key of this use of the song, in semitones (−11…11); 0 is the song's own key */
    setTranspose(id: string, itemId: string, semitones: number): Promise<Setlist> {
        return this.editItems(id, (items) =>
            items.map((item) => (item.id === itemId ? { ...item, transpose: wrap(semitones) } : item)),
        );
    }

    // --- internals ---

    private editItems(id: string, change: (items: readonly SetlistItem[]) => readonly SetlistItem[]): Promise<Setlist> {
        return this.edit(id, (list) => ({ items: change(list.items) }));
    }

    /** Reads the list, applies the change and saves it with a newer stamp, one change at a time */
    private edit(
        id: string,
        change: (list: Setlist) => Partial<Setlist> | Promise<Partial<Setlist>>,
    ): Promise<Setlist> {
        return this.serial(async () => {
            const current = await this.get(id);
            if (current === undefined) {
                throw new Error('El listado ya no existe.');
            }
            const next: Setlist = { ...current, ...(await change(current)), updatedAt: this.stamp(current) };
            assertFits(next);
            await this.store.save('setlists', next);
            this.afterWrite();

            return next;
        });
    }

    private serial<T>(work: () => Promise<T>): Promise<T> {
        const run = this.tail.then(work);
        this.tail = run.catch(() => undefined);

        return run;
    }

    /** Strictly after the version it replaces, even if this device's clock is behind */
    private stamp(previous: Setlist): number {
        return Math.max(this.now(), previous.updatedAt + 1);
    }
}

/** A shift kept within an octave, −11…11, as the song viewer does: 11 + 1 comes back to 0 */
function wrap(semitones: number): number {
    return Math.trunc(semitones) % 12 || 0;
}

function cleanDraft(draft: SetlistDraft): SetlistDraft {
    const title = draft.title.trim();
    const notes = draft.notes.trim();
    if (title === '') {
        throw new ValidationError('El listado necesita un título.');
    }
    if (Array.from(title).length > LIMITS.title) {
        throw new ValidationError(`El título es demasiado largo (máximo ${LIMITS.title} caracteres).`);
    }
    if (draft.eventDate !== null && !isValidDate(draft.eventDate)) {
        throw new ValidationError('La fecha no es válida.');
    }
    if (Array.from(notes).length > LIMITS.notes) {
        throw new ValidationError(`Las notas son demasiado largas (máximo ${LIMITS.notes} caracteres).`);
    }

    return { title, eventDate: draft.eventDate, notes };
}

/** The server takes at most this many bytes of items; better to say so here than to have it refuse the list later */
function assertFits(list: Setlist): void {
    if (new TextEncoder().encode(JSON.stringify(list.items)).length > LIMITS.itemsJson) {
        throw new ValidationError('El listado es demasiado grande: quita algunas notas o cantos.');
    }
}
