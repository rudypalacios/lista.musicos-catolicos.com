import { shouldTakeRemote, supersedes } from './merge.ts';
import type { LocalStore } from './store.ts';
import { COLLECTIONS, type Collection, type Pulled, type Records } from './types.ts';

/**
 * IndexedDB schema versions:
 * 1. `songs`, `pending` (the queue of songs), `meta`.
 * 2. adds `setlists` and `pending-setlists`.
 * 3. lists carry their own sections (`Setlist.parts`): the lists of the device are dropped and the cursor is reset
 *    (see `open`).
 */
const VERSION = 3;

/** The object store of each collection's records, and of its queue of unsent ones */
const DATA: Readonly<Record<Collection, string>> = { songs: 'songs', setlists: 'setlists' };
const QUEUE: Readonly<Record<Collection, string>> = { songs: 'pending', setlists: 'pending-setlists' };
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

/** The songs and setlists of the device in IndexedDB: what is kept offline, and survives a new app version */
export class IdbStore implements LocalStore {
    private readonly db: IDBDatabase;

    private constructor(db: IDBDatabase) {
        this.db = db;
        // A later version of the app (another tab) wants to upgrade the database: let it
        db.onversionchange = () => db.close();
    }

    /**
     * @param factory the IndexedDB to use (the browser's, or a fake in tests)
     * @param name    one database per name, so tests never meet each other
     * @param onBlocked called when an upgrade has to wait because another window still has the
     *                  database open with an older version of the app; it goes on by itself when
     *                  that window is closed
     */
    static open(factory: IDBFactory = indexedDB, name = 'lista', onBlocked?: () => void): Promise<IdbStore> {
        return new Promise((resolve, reject) => {
            const request = factory.open(name, VERSION);
            request.onupgradeneeded = (event) => {
                const db = request.result;
                for (const store of [...Object.values(DATA), ...Object.values(QUEUE)]) {
                    if (!db.objectStoreNames.contains(store)) {
                        db.createObjectStore(store, { keyPath: 'id' });
                    }
                }
                if (!db.objectStoreNames.contains(META)) {
                    db.createObjectStore(META, { keyPath: 'key' });
                }
                // Version 3: a list without sections is not valid any more, and the server removed the ones it
                // had (migration 0008; the owner chose to start the lists again). The lists this device holds
                // and the ones waiting to be sent go too, or they would be sent and refused. The cursor starts
                // again from zero so the songs come back from the server as they are (they are merged by the
                // same rules as always, and the songs not yet sent stay in their queue). This also covers an
                // older device: before version 2 the cursor may have moved past lists this version had not seen.
                if (event.oldVersion >= 1 && event.oldVersion < 3) {
                    const tx = request.transaction;
                    tx?.objectStore(DATA.setlists).clear();
                    tx?.objectStore(QUEUE.setlists).clear();
                    tx?.objectStore(META).delete(CURSOR);
                }
            };
            request.onblocked = () => onBlocked?.();
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

    all<C extends Collection>(collection: C): Promise<Records[C][]> {
        return this.transaction([DATA[collection]], 'readonly', (open) =>
            done(open(DATA[collection]).getAll() as IDBRequest<Records[C][]>),
        );
    }

    get<C extends Collection>(collection: C, id: string): Promise<Records[C] | undefined> {
        return this.transaction([DATA[collection]], 'readonly', (open) =>
            done(open(DATA[collection]).get(id) as IDBRequest<Records[C] | undefined>),
        );
    }

    save<C extends Collection>(collection: C, record: Records[C]): Promise<void> {
        return this.transaction([DATA[collection], QUEUE[collection]], 'readwrite', async (open) => {
            await done(open(DATA[collection]).put(record));
            await done(open(QUEUE[collection]).put(record));
        });
    }

    pending<C extends Collection>(collection: C): Promise<Records[C][]> {
        return this.transaction([QUEUE[collection]], 'readonly', (open) =>
            done(open(QUEUE[collection]).getAll() as IDBRequest<Records[C][]>),
        );
    }

    clearPending<C extends Collection>(collection: C, sent: readonly Records[C][]): Promise<void> {
        return this.transaction([QUEUE[collection]], 'readwrite', async (open) => {
            const queue = open(QUEUE[collection]);
            for (const record of sent) {
                const queued = (await done(queue.get(record.id))) as Records[C] | undefined;
                if (queued?.updatedAt === record.updatedAt) {
                    await done(queue.delete(record.id));
                }
            }
        });
    }

    mergeRemote(page: Pick<Pulled, 'songs' | 'setlists'>, cursor: number): Promise<void> {
        const stores = [META, ...Object.values(DATA), ...Object.values(QUEUE)];

        return this.transaction(stores, 'readwrite', async (open) => {
            for (const collection of COLLECTIONS) {
                const records = open(DATA[collection]);
                const queue = open(QUEUE[collection]);
                for (const remote of page[collection]) {
                    const local = (await done(records.get(remote.id))) as Records[typeof collection] | undefined;
                    const pending = (await done(queue.get(remote.id))) as Records[typeof collection] | undefined;
                    if (shouldTakeRemote(local, pending, remote)) {
                        await done(records.put(remote));
                        if (supersedes(remote, pending)) {
                            await done(queue.delete(remote.id));
                        }
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
        const stores = [META, ...Object.values(DATA), ...Object.values(QUEUE)];

        return this.transaction(stores, 'readwrite', async (open) => {
            for (const store of stores) {
                await done(open(store).clear());
            }
        });
    }
}
