/** A song as the app keeps it, and as the sync API sends it (src/Sync/SongChange.php) */
export interface Song {
    readonly id: string;
    readonly title: string;
    /** Free text, "" when there is none */
    readonly author: string;
    /** The lyrics in ChordPro */
    readonly body: string;
    /** "Mi tono": the key the person sings it in, in semitones from the written one (−11…11; 0 is the same as none) */
    readonly myShift: number;
    /** When this version was written, by the clock of the device that wrote it (epoch ms) */
    readonly updatedAt: number;
    /** When it was deleted, or null. A deleted song stays as a tombstone so the deletion syncs */
    readonly deletedAt: number | null;
}

/**
 * A section of a list (what the person sees as "sección"; the code says "part"): the band songs are placed
 * under. The list carries its own, in order, copied from a template when it is made, so changing a template never
 * changes a list that exists (src/Sync/SetlistChange.php).
 */
export interface PartDef {
    /** Never changes, so renaming a section leaves its songs where they are. The Mass's keep their ids (`mass.ts`) */
    readonly id: string;
    /** What the app shows */
    readonly name: string;
    /** Switched off: hidden from the list but kept (it comes back where it was). Only a section with no songs can be off */
    readonly off?: true;
    /** The slot can be left empty without a word (a badge says so) */
    readonly optional?: true;
    /** A tooltip explaining the section, when the person might wonder why it is there */
    readonly note?: string;
}

/**
 * One song placed in one section of a setlist (src/Sync/SetlistChange.php).
 * `transpose` is for this list only: the song itself is never changed by it.
 */
export interface SetlistItem {
    /** Its own id (made on the device), so the same song can be in a list twice */
    readonly id: string;
    /** The id of one of the list's parts (`Setlist.parts`) */
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
    /** Its sections, in order. Never empty (the server refuses a list with none) */
    readonly parts: readonly PartDef[];
    /** A favourite: the lists screen shows the starred ones first. Synced with the rest of the list */
    readonly starred: boolean;
    /** In the order they were added; the order within a part is the order here */
    readonly items: readonly SetlistItem[];
    readonly updatedAt: number;
    readonly deletedAt: number | null;
}

/**
 * The sections a new list starts with, under a name ("Misa", "Rosario"). A list takes a copy when it is made, so
 * changing or deleting a template never touches a list that exists (src/Sync/TemplateChange.php).
 */
export interface Template {
    readonly id: string;
    readonly name: string;
    /** In order; never empty (the server refuses a template with none) */
    readonly parts: readonly PartDef[];
    readonly updatedAt: number;
    readonly deletedAt: number | null;
}

/** The kinds of record the app keeps and syncs, by the name they have in the API and the store */
export interface Records {
    songs: Song;
    setlists: Setlist;
    templates: Template;
}

export type Collection = keyof Records;

export const COLLECTIONS: readonly Collection[] = ['songs', 'setlists', 'templates'];

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
    templates: Template[];
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
    /** Sections in one setlist, and the characters of a section's name and note, and bytes of the sections as JSON */
    parts: 30,
    partName: 60,
    partNote: 300,
    partsJson: 8000,
    /** Templates a person keeps, and the characters of a template's name */
    templates: 20,
    templateName: 60,
} as const;
