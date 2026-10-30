import { nearestShift } from './keys.ts';
import { api, errorKinds, remote } from './api.ts';
import { IdbStore } from './data/idb-store.ts';
import { Library, type SongDraft } from './data/library.ts';
import { MemoryStore } from './data/memory-store.ts';
import { Setlists } from './data/setlists.ts';
import type { LocalStore } from './data/store.ts';
import { SyncEngine, SyncStopped } from './data/sync.ts';
import type { Song } from './data/types.ts';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'error';

export interface Status {
    state: SyncState;
    /** Songs and lists written on this device that the server does not have yet */
    pending: number;
    /** Of those, the ones the server refused */
    rejected: number;
    /** False when the browser cannot keep data (no IndexedDB): nothing survives a reload */
    durable: boolean;
}

/**
 * The app's one set of things that live as long as the page: where the songs and lists are
 * kept, the library, the setlists, and the sync with the server. Views ask it for songs and
 * lists and tell it what the person wrote; it saves locally first and syncs when it can.
 */
export class App {
    private readonly store: LocalStore;
    private readonly library: Library;
    /** The person's setlists: every change made through it is saved here and synced */
    readonly setlists: Setlists;
    private readonly engine: SyncEngine;
    private readonly durable: boolean;
    private running: Promise<void> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private rejected = new Set<string>();
    private state: SyncState = 'idle';
    private pendingCount = 0;
    private readonly statusListeners = new Set<(status: Status) => void>();
    private readonly dataListeners = new Set<() => void>();
    private readonly savedListeners = new Set<() => void>();

    private constructor(store: LocalStore, durable: boolean) {
        this.store = store;
        this.durable = durable;
        this.library = new Library(store);
        this.setlists = new Setlists(store, () => void this.afterWrite(undefined));
        this.engine = new SyncEngine(store, remote, errorKinds);
    }

    /**
     * Opens the device's store; without IndexedDB the app still works, but only until a reload.
     *
     * @param onBlocked the store is waiting for another window of an older version to close
     */
    static async create(onBlocked?: () => void): Promise<App> {
        try {
            const app = new App(await IdbStore.open(indexedDB, 'lista', onBlocked), true);
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
        this.emitData();
    }

    /** How many songs and lists would be lost by clearing this device (written here, never sent) */
    unsent(): Promise<number> {
        return this.countPending();
    }

    /** Forgets everything on this device (sign out) */
    async wipe(): Promise<void> {
        await this.store.clear();
        this.rejected.clear();
        this.pendingCount = 0;
        this.emitData();
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

    /**
     * Saves an edit of a song whose written key moved by `moved` semitones (0 when it did not), and moves the
     * keys people sing it in the other way ("mi tono" and every use of it in a list), so each sounds as it did.
     * Returns the uses in lists it touched.
     */
    async updateKeepingKeys(id: string, draft: SongDraft, moved: number): Promise<{ song: Song; touched: { setlistId: string; itemId: string }[] }> {
        let song = await this.library.update(id, draft);
        let touched: { setlistId: string; itemId: string }[] = [];
        if (moved !== 0) {
            if (song.myShift !== 0) {
                song = await this.library.setMyShift(id, nearestShift(song.myShift - moved));
            }
            touched = await this.setlists.retuneSong(id, moved);
        }

        return this.afterWrite({ song, touched });
    }

    /** Sets "mi tono" of a song (see `Library.setMyShift`) */
    async setMyShift(id: string, shift: number): Promise<Song> {
        return this.afterWrite(await this.library.setMyShift(id, shift));
    }

    async remove(id: string): Promise<void> {
        await this.library.remove(id);
        await this.afterWrite(undefined);
    }

    private async afterWrite<T>(result: T): Promise<T> {
        await this.refreshPending();
        this.emitData();
        this.savedListeners.forEach((listener) => listener());
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
                this.emitData();
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

    /** Called when the songs or lists change (a write here, or records that arrived) */
    onData(listener: () => void): () => void {
        this.dataListeners.add(listener);

        return () => this.dataListeners.delete(listener);
    }

    /** Called after something the person wrote here is saved on the device (not for records that arrived) */
    onSaved(listener: () => void): () => void {
        this.savedListeners.add(listener);

        return () => this.savedListeners.delete(listener);
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
        this.pendingCount = await this.countPending();
        this.emitStatus();
    }

    private async countPending(): Promise<number> {
        const [songs, lists] = await Promise.all([this.store.pending('songs'), this.store.pending('setlists')]);

        return songs.length + lists.length;
    }

    private emitStatus(): void {
        const status = this.status();
        this.statusListeners.forEach((listener) => listener(status));
    }

    private emitData(): void {
        this.dataListeners.forEach((listener) => listener());
    }
}

/** Whether signing out is safe, or songs and lists written here and never sent would be lost */
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
