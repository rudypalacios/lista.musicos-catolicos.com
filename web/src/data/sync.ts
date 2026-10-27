import type { LocalStore } from './store.ts';
import { LIMITS, type Remote, type Song } from './types.ts';

export interface SyncResult {
    /** Songs the server stored */
    pushed: number;
    /** Songs that came from the server */
    pulled: number;
    /** Songs the server refused (they stay on the device, marked, and do not block the rest) */
    rejected: string[];
}

/** What stopped a sync, for the caller to tell apart */
export class SyncStopped extends Error {
    /** "offline": no network, try later. "signed-out": the session ended, sign in again. */
    readonly reason: 'offline' | 'signed-out';

    constructor(reason: 'offline' | 'signed-out', cause?: unknown) {
        super(reason === 'offline' ? 'Sin conexión.' : 'La sesión terminó.', { cause });
        this.name = 'SyncStopped';
        this.reason = reason;
    }
}

/** How the engine recognises the errors of the remote, without knowing HTTP */
export interface ErrorKinds {
    isOffline(error: unknown): boolean;
    isSignedOut(error: unknown): boolean;
    /** The server refused the content of a song (HTTP 400) */
    isRefusal(error: unknown): boolean;
}

/**
 * Sends what was written on this device and brings what was written elsewhere:
 *
 * 1. push the songs waiting in the queue, in batches. A batch the server refuses is retried
 *    song by song, so one bad song cannot keep the others from ever arriving.
 * 2. pull from the cursor, page by page, merging each page and moving the cursor with it.
 *
 * It can stop at any point and be run again: the queue only loses a song once the server has
 * it, and the cursor only moves together with the songs it covers.
 */
export class SyncEngine {
    private readonly store: LocalStore;
    private readonly remote: Remote;
    private readonly errors: ErrorKinds;

    constructor(store: LocalStore, remote: Remote, errors: ErrorKinds) {
        this.store = store;
        this.remote = remote;
        this.errors = errors;
    }

    async sync(): Promise<SyncResult> {
        const result: SyncResult = { pushed: 0, pulled: 0, rejected: [] };
        try {
            await this.push(result);
            await this.pull(result);
        } catch (error) {
            if (error instanceof SyncStopped) {
                throw error;
            }
            if (this.errors.isOffline(error)) {
                throw new SyncStopped('offline', error);
            }
            if (this.errors.isSignedOut(error)) {
                throw new SyncStopped('signed-out', error);
            }
            throw error;
        }

        return result;
    }

    private async push(result: SyncResult): Promise<void> {
        const waiting = await this.store.pending();
        for (let from = 0; from < waiting.length; from += LIMITS.batch) {
            const batch = waiting.slice(from, from + LIMITS.batch);
            try {
                await this.send(batch, result);
            } catch (error) {
                if (!this.errors.isRefusal(error)) {
                    throw error;
                }
                for (const song of batch) {
                    try {
                        await this.send([song], result);
                    } catch (single) {
                        if (!this.errors.isRefusal(single)) {
                            throw single;
                        }
                        result.rejected.push(song.id);
                    }
                }
            }
        }
    }

    private async send(songs: readonly Song[], result: SyncResult): Promise<void> {
        const answer = await this.remote.push(songs);
        // Applied or ignored, the server has the winner: this copy no longer needs to travel
        await this.store.clearPending(songs);
        result.pushed += answer.applied.length;
    }

    private async pull(result: SyncResult): Promise<void> {
        let cursor = await this.store.cursor();
        for (;;) {
            const page = await this.remote.pull(cursor);
            await this.store.mergeRemote(page.songs, page.cursor);
            result.pulled += page.songs.length;
            if (!page.hasMore || page.cursor <= cursor) {
                return;
            }
            cursor = page.cursor;
        }
    }
}
