import type { LocalStore } from './store.ts';
import { COLLECTIONS, LIMITS, type Collection, type Records, type Remote } from './types.ts';

export interface SyncResult {
    /** Records (songs, setlists and templates) the server stored */
    pushed: number;
    /** Records that came from the server */
    pulled: number;
    /** Records the server refused (they stay on the device, marked, and do not block the rest) */
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
    /** The server refused the content of a record (HTTP 400) */
    isRefusal(error: unknown): boolean;
}

/**
 * Sends what was written on this device and brings what was written elsewhere:
 *
 * 1. push what waits in the queues (songs, setlists, templates), in batches. A batch the server
 *    refuses is retried record by record, so one bad record cannot keep the others from ever
 *    arriving.
 * 2. pull from the cursor, page by page, merging each page and moving the cursor with it.
 *
 * It can stop at any point and be run again: a queue only loses a record once the server has
 * it, and the cursor only moves together with the records it covers.
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
        for (const collection of COLLECTIONS) {
            await this.pushCollection(collection, result);
        }
    }

    private async pushCollection<C extends Collection>(collection: C, result: SyncResult): Promise<void> {
        const waiting = await this.store.pending(collection);
        for (let from = 0; from < waiting.length; from += LIMITS.batch) {
            const batch = waiting.slice(from, from + LIMITS.batch);
            try {
                await this.send(collection, batch, result);
            } catch (error) {
                if (!this.errors.isRefusal(error)) {
                    throw error;
                }
                for (const record of batch) {
                    try {
                        await this.send(collection, [record], result);
                    } catch (single) {
                        if (!this.errors.isRefusal(single)) {
                            throw single;
                        }
                        result.rejected.push(record.id);
                    }
                }
            }
        }
    }

    private async send<C extends Collection>(
        collection: C,
        records: readonly Records[C][],
        result: SyncResult,
    ): Promise<void> {
        const answer = await this.remote.push(collection, records);
        // Applied or ignored, the server has the winner: this copy no longer needs to travel
        await this.store.clearPending(collection, records);
        result.pushed += answer.applied.length;
    }

    private async pull(result: SyncResult): Promise<void> {
        let cursor = await this.store.cursor();
        for (;;) {
            const page = await this.remote.pull(cursor);
            await this.store.mergeRemote(page, page.cursor);
            result.pulled += page.songs.length + page.setlists.length + page.templates.length;
            if (!page.hasMore || page.cursor <= cursor) {
                return;
            }
            cursor = page.cursor;
        }
    }
}
