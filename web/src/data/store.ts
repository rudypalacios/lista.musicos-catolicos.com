import type { Song } from './types.ts';

/**
 * What the app keeps on the device: the songs, the ones not yet sent to the server (`pending`,
 * one entry per song, always the latest version), and where the last pull stopped.
 *
 * Two implementations obey the same contract (test/data/store.contract.ts): IndexedDB in the
 * browser, and a Map for tests and for browsers without IndexedDB.
 */
export interface LocalStore {
    /** Every song, deleted ones included (tombstones) */
    allSongs(): Promise<Song[]>;
    getSong(id: string): Promise<Song | undefined>;

    /** Writes the song and queues it for the server, as one step: both or neither */
    saveSong(song: Song): Promise<void>;

    /** The songs waiting to be sent */
    pending(): Promise<Song[]>;

    /**
     * Forgets the queued copies of `sent`, unless the song was edited again since: that newer
     * copy still has to go.
     */
    clearPending(sent: readonly Song[]): Promise<void>;

    /**
     * Applies what a pull returned and moves the cursor, as one step (see shouldTakeRemote).
     * A pull that stops half way must not leave the cursor ahead of the songs.
     */
    mergeRemote(songs: readonly Song[], cursor: number): Promise<void>;

    /** The change number the last pull reached, 0 before the first */
    cursor(): Promise<number>;

    /** Whose songs these are (email), so another account never sees them */
    owner(): Promise<string | null>;
    setOwner(email: string): Promise<void>;

    /** Forgets everything: songs, the queue, the cursor and the owner */
    clear(): Promise<void>;
}
