import { api, errorKinds, remote } from './api.ts';
import { IdbStore } from './data/idb-store.ts';
import { Library, type SongDraft } from './data/library.ts';
import { MemoryStore } from './data/memory-store.ts';
import type { LocalStore } from './data/store.ts';
import { SyncEngine, SyncStopped } from './data/sync.ts';
import type { Song } from './data/types.ts';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'error';

export interface Status {
    state: SyncState;
    /** Songs written on this device that the server does not have yet */
    pending: number;
    /** Of those, the ones the server refused */
    rejected: number;
    /** False when the browser cannot keep data (no IndexedDB): nothing survives a reload */
    durable: boolean;
}

/**
 * The app's one set of things that live as long as the page: where the songs are kept, the
 * library, and the sync with the server. Views ask it for songs and tell it what the person
 * wrote; it saves locally first and syncs when it can.
 */
export class App {
    private readonly store: LocalStore;
    private readonly library: Library;
    private readonly engine: SyncEngine;
    private readonly durable: boolean;
    private running: Promise<void> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private rejected = new Set<string>();
    private state: SyncState = 'idle';
    private pendingCount = 0;
    private readonly statusListeners = new Set<(status: Status) => void>();
    private readonly songListeners = new Set<() => void>();

    private constructor(store: LocalStore, durable: boolean) {
        this.store = store;
        this.durable = durable;
        this.library = new Library(store);
        this.engine = new SyncEngine(store, remote, errorKinds);
    }

    /** Opens the device's store; without IndexedDB the app still works, but only until a reload */
    static async create(): Promise<App> {
        try {
            const app = new App(await IdbStore.open(), true);
            await app.refreshPending();

            return app;
        } catch {
            return new App(new MemoryStore(), false);
        }
    }

    // --- whose songs these are ------------------------------------------------------------

    /** The email whose songs this device holds, or null */
    owner(): Promise<string | null> {
        return this.store.owner();
    }

    /**
     * Claims the device's songs for `email`. If they were another person's they are removed
     * first: a shared tablet must never show one account's songs to another.
     */
    async adopt(email: string): Promise<void> {
        const owner = await this.store.owner();
        if (owner !== null && owner !== email) {
            await this.store.clear();
            this.rejected.clear();
        }
        await this.store.setOwner(email);
        await this.refreshPending();
        this.emitSongs();
    }

    /** How many songs would be lost by clearing this device (written here, never sent) */
    async unsent(): Promise<number> {
        return (await this.store.pending()).length;
    }

    /** Forgets everything on this device (sign out) */
    async wipe(): Promise<void> {
        await this.store.clear();
        this.rejected.clear();
        this.pendingCount = 0;
        this.emitSongs();
        this.emitStatus();
    }

    // --- songs ---------------------------------------------------------------------------

    list(): Promise<Song[]> {
        return this.library.list();
    }

    get(id: string): Promise<Song | undefined> {
        return this.library.get(id);
    }

    async create(draft: SongDraft): Promise<Song> {
        return this.afterWrite(await this.library.create(draft));
    }

    async update(id: string, draft: SongDraft): Promise<Song> {
        return this.afterWrite(await this.library.update(id, draft));
    }

    async remove(id: string): Promise<void> {
        await this.library.remove(id);
        await this.afterWrite(undefined);
    }

    private async afterWrite<T>(result: T): Promise<T> {
        await this.refreshPending();
        this.emitSongs();
        this.requestSync();

        return result;
    }

    // --- sync ----------------------------------------------------------------------------

    /** Syncs soon (a burst of edits becomes one sync) */
    requestSync(delay = 800): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.syncNow();
        }, delay);
    }

    /** Runs a sync now, or joins the one that is running. Never throws: the outcome is the status. */
    syncNow(): Promise<void> {
        if (this.running === null) {
            this.running = this.run().finally(() => {
                this.running = null;
            });
        }

        return this.running;
    }

    private async run(): Promise<void> {
        this.state = 'syncing';
        this.emitStatus();
        try {
            const result = await this.engine.sync();
            this.rejected = new Set(result.rejected);
            this.state = 'idle';
            if (result.pulled > 0) {
                this.emitSongs();
            }
        } catch (error) {
            this.state = error instanceof SyncStopped ? (error.reason === 'offline' ? 'offline' : 'signed-out') : 'error';
        }
        await this.refreshPending();
    }

    status(): Status {
        return { state: this.state, pending: this.pendingCount, rejected: this.rejected.size, durable: this.durable };
    }

    onStatus(listener: (status: Status) => void): () => void {
        this.statusListeners.add(listener);

        return () => this.statusListeners.delete(listener);
    }

    /** Called when the list of songs changes (a write here, or songs that arrived) */
    onSongs(listener: () => void): () => void {
        this.songListeners.add(listener);

        return () => this.songListeners.delete(listener);
    }

    /** After the session ended and the person signed in again */
    resumed(): void {
        this.state = 'idle';
        this.requestSync(0);
    }

    /** Sync whenever there is a reason to think it can now succeed or has something new */
    watchConnection(): void {
        window.addEventListener('online', () => this.requestSync(0));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.requestSync(0);
            }
        });
        // An open tab on a stand all Sunday morning still picks up what was edited elsewhere
        setInterval(() => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                this.requestSync(0);
            }
        }, 5 * 60 * 1000);
    }

    private async refreshPending(): Promise<void> {
        this.pendingCount = (await this.store.pending()).length;
        this.emitStatus();
    }

    private emitStatus(): void {
        const status = this.status();
        this.statusListeners.forEach((listener) => listener(status));
    }

    private emitSongs(): void {
        this.songListeners.forEach((listener) => listener());
    }
}

/** Whether signing out is safe, or songs written here and never sent would be lost */
export async function signOut(app: App, confirmLoss: (unsent: number) => boolean): Promise<boolean> {
    // Try to send what is waiting first
    await app.syncNow();
    const unsent = await app.unsent();
    if (unsent > 0 && !confirmLoss(unsent)) {
        return false;
    }
    try {
        await api.logout();
    } catch {
        // Offline: the cookie stays until it can be cleared, but this device forgets the songs
    }
    await app.wipe();

    return true;
}
