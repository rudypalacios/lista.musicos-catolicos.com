import { shouldTakeRemote, supersedes } from './merge.ts';
import type { LocalStore } from './store.ts';
import type { Song } from './types.ts';

const SONGS = 'songs';
const PENDING = 'pending';
const META = 'meta';
const CURSOR = 'cursor';
const OWNER = 'owner';

interface Meta {
    key: string;
    value: number | string;
}

/** An IDBRequest as a promise */
function done<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
}

/** The songs of the device in IndexedDB: what is kept offline, and survives a new app version */
export class IdbStore implements LocalStore {
    private readonly db: IDBDatabase;

    private constructor(db: IDBDatabase) {
        this.db = db;
    }

    /**
     * @param factory the IndexedDB to use (the browser's, or a fake in tests)
     * @param name    one database per name, so tests never meet each other
     */
    static open(factory: IDBFactory = indexedDB, name = 'lista'): Promise<IdbStore> {
        return new Promise((resolve, reject) => {
            const request = factory.open(name, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                db.createObjectStore(SONGS, { keyPath: 'id' });
                db.createObjectStore(PENDING, { keyPath: 'id' });
                db.createObjectStore(META, { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(new IdbStore(request.result));
            request.onerror = () => reject(request.error ?? new Error('Cannot open IndexedDB'));
        });
    }

    close(): void {
        this.db.close();
    }

    /** Runs `work` in one transaction and resolves when it has been committed */
    private transaction<T>(
        stores: string[],
        mode: IDBTransactionMode,
        work: (open: (name: string) => IDBObjectStore) => Promise<T>,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(stores, mode);
            let result: T;
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
            work((name) => tx.objectStore(name)).then(
                (value) => {
                    result = value;
                },
                (error: unknown) => {
                    reject(error instanceof Error ? error : new Error(String(error)));
                    tx.abort();
                },
            );
        });
    }

    allSongs(): Promise<Song[]> {
        return this.transaction([SONGS], 'readonly', (open) => done(open(SONGS).getAll() as IDBRequest<Song[]>));
    }

    getSong(id: string): Promise<Song | undefined> {
        return this.transaction([SONGS], 'readonly', (open) => done(open(SONGS).get(id) as IDBRequest<Song | undefined>));
    }

    saveSong(song: Song): Promise<void> {
        return this.transaction([SONGS, PENDING], 'readwrite', async (open) => {
            await done(open(SONGS).put(song));
            await done(open(PENDING).put(song));
        });
    }

    pending(): Promise<Song[]> {
        return this.transaction([PENDING], 'readonly', (open) => done(open(PENDING).getAll() as IDBRequest<Song[]>));
    }

    clearPending(sent: readonly Song[]): Promise<void> {
        return this.transaction([PENDING], 'readwrite', async (open) => {
            const queue = open(PENDING);
            for (const song of sent) {
                const queued = (await done(queue.get(song.id))) as Song | undefined;
                if (queued?.updatedAt === song.updatedAt) {
                    await done(queue.delete(song.id));
                }
            }
        });
    }

    mergeRemote(songs: readonly Song[], cursor: number): Promise<void> {
        return this.transaction([SONGS, PENDING, META], 'readwrite', async (open) => {
            const store = open(SONGS);
            const queue = open(PENDING);
            for (const remote of songs) {
                const local = (await done(store.get(remote.id))) as Song | undefined;
                const pending = (await done(queue.get(remote.id))) as Song | undefined;
                if (shouldTakeRemote(local, pending, remote)) {
                    await done(store.put(remote));
                    if (supersedes(remote, pending)) {
                        await done(queue.delete(remote.id));
                    }
                }
            }
            const meta = open(META);
            const current = (await done(meta.get(CURSOR))) as Meta | undefined;
            const before = typeof current?.value === 'number' ? current.value : 0;
            await done(meta.put({ key: CURSOR, value: Math.max(before, cursor) } satisfies Meta));
        });
    }

    async cursor(): Promise<number> {
        const meta = await this.transaction([META], 'readonly', (open) =>
            done(open(META).get(CURSOR) as IDBRequest<Meta | undefined>),
        );

        return typeof meta?.value === 'number' ? meta.value : 0;
    }

    async owner(): Promise<string | null> {
        const meta = await this.transaction([META], 'readonly', (open) =>
            done(open(META).get(OWNER) as IDBRequest<Meta | undefined>),
        );

        return typeof meta?.value === 'string' ? meta.value : null;
    }

    setOwner(email: string): Promise<void> {
        return this.transaction([META], 'readwrite', async (open) => {
            await done(open(META).put({ key: OWNER, value: email } satisfies Meta));
        });
    }

    clear(): Promise<void> {
        return this.transaction([SONGS, PENDING, META], 'readwrite', async (open) => {
            await done(open(SONGS).clear());
            await done(open(PENDING).clear());
            await done(open(META).clear());
        });
    }
}
