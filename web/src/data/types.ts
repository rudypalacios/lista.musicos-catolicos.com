/** A song as the app keeps it, and as the sync API sends it (src/Sync/SongChange.php) */
export interface Song {
    readonly id: string;
    readonly title: string;
    /** Free text, "" when there is none */
    readonly author: string;
    /** The lyrics in ChordPro */
    readonly body: string;
    /** When this version was written, by the clock of the device that wrote it (epoch ms) */
    readonly updatedAt: number;
    /** When it was deleted, or null. A deleted song stays as a tombstone so the deletion syncs */
    readonly deletedAt: number | null;
}

/**
 * One song placed in one part of the Mass, inside a setlist (src/Sync/SetlistChange.php).
 * `transpose` is for this list only: the song itself is never changed by it.
 */
export interface SetlistItem {
    /** Its own id (made on the device), so the same song can be in a list twice */
    readonly id: string;
    /** The id of a part in `MASS_PARTS` (mass.ts) */
    readonly part: string;
    readonly songId: string;
    /** Semitones, −11…11 */
    readonly transpose: number;
    /** Free text for this use of the song ("sin el último coro"), "" when there is none */
    readonly note: string;
}

/**
 * The music of one Mass. It is one record, items included, and the whole list is what the
 * newest-edit-wins rule compares.
 */
export interface Setlist {
    readonly id: string;
    readonly title: string;
    /** The day of the Mass, `YYYY-MM-DD`, or null */
    readonly eventDate: string | null;
    readonly notes: string;
    /** A favourite: the lists screen shows the starred ones first. Synced with the rest of the list */
    readonly starred: boolean;
    /** In the order they were added; the order within a part is the order here */
    readonly items: readonly SetlistItem[];
    readonly updatedAt: number;
    readonly deletedAt: number | null;
}

/** The kinds of record the app keeps and syncs, by the name they have in the API and the store */
export interface Records {
    songs: Song;
    setlists: Setlist;
}

export type Collection = keyof Records;

export const COLLECTIONS: readonly Collection[] = ['songs', 'setlists'];

/** What every record has for syncing */
export interface Stamped {
    readonly id: string;
    readonly updatedAt: number;
    readonly deletedAt: number | null;
}

/** What a pull answers (GET /api/sync) */
export interface Pulled {
    songs: Song[];
    setlists: Setlist[];
    cursor: number;
    hasMore: boolean;
}

/** What a push answers (POST /api/sync) */
export interface Pushed {
    applied: string[];
    ignored: string[];
}

/** The server, as the sync engine sees it */
export interface Remote {
    pull(since: number): Promise<Pulled>;
    push<C extends Collection>(collection: C, records: readonly Records[C][]): Promise<Pushed>;
}

export const LIMITS = {
    title: 190,
    author: 190,
    /** Bytes, as on the server */
    body: 60000,
    /** Records per push, as on the server */
    batch: 100,
    /** Characters of a setlist's notes */
    notes: 2000,
    /** Songs in one setlist */
    items: 80,
    /** Bytes of a setlist's items as JSON */
    itemsJson: 60000,
    /** Semitones up or down */
    transpose: 11,
} as const;
