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

/** What a pull answers (GET /api/sync) */
export interface Pulled {
    songs: Song[];
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
    push(songs: readonly Song[]): Promise<Pushed>;
}

export const LIMITS = {
    title: 190,
    author: 190,
    /** Bytes, as on the server */
    body: 60000,
    /** Songs per push, as on the server */
    batch: 100,
} as const;
