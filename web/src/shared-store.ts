/**
 * The copies of shared lists a visitor keeps on their device, to read them with no connection. It is a database of its own,
 * apart from the owner's (data/idb-store.ts): a visitor has no account, and nothing here ever reaches the server or mixes with
 * a person's songs. It is only a cache: a copy that cannot be kept or read is not an error, the list is just not available
 * offline, so nothing here throws.
 */
import type { SharedList } from './shared-model.ts';

const DATABASE = 'lista-shared';
const STORE = 'lists';
/** The most copies kept: opening more links drops the oldest, so the device never fills up with lists nobody reads */
export const MAX_COPIES = 20;

export interface Copy {
    code: string;
    list: SharedList;
    /** When the copy was made (epoch ms): what "la copia guardada el …" says */
    savedAt: number;
}

export interface Copies {
    /** Keeps (or replaces) the copy of the list at `code` */
    save: (code: string, list: SharedList, now?: number) => Promise<void>;
    load: (code: string) => Promise<Copy | undefined>;
    /** Forgets the copy: the link was stopped, so there is nothing to read any more */
    remove: (code: string) => Promise<void>;
}

function request<T>(from: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        from.onsuccess = () => resolve(from.result);
        from.onerror = () => reject(from.error);
    });
}

function opened(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const opening = factory.open(DATABASE, 1);
        opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'code' });
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
        opening.onblocked = () => reject(new Error('blocked'));
    });
}

/** Runs `work` on the store inside a transaction, closing the database after; a failure is the caller's to ignore */
async function within<T>(factory: IDBFactory, mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await opened(factory);
    try {
        const transaction = db.transaction(STORE, mode);
        const done = new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        const result = await work(transaction.objectStore(STORE));
        await done;

        return result;
    } finally {
        db.close();
    }
}

/** The visitor's copies, in this browser's IndexedDB (or `factory`, in a test) */
export function openCopies(factory: IDBFactory | undefined = globalThis.indexedDB): Copies {
    // A browser with no IndexedDB (or one that refuses it): no copies, and no error either
    if (factory === undefined) {
        return { save: () => Promise.resolve(), load: () => Promise.resolve(undefined), remove: () => Promise.resolve() };
    }

    return {
        save: async (code, list, now = Date.now()) => {
            try {
                await within(factory, 'readwrite', async (store) => {
                    await request(store.put({ code, list, savedAt: now } satisfies Copy));
                    // Keep the newest MAX_COPIES: the oldest go
                    const all = await request(store.getAll() as IDBRequest<Copy[]>);
                    const surplus = all.sort((a, b) => b.savedAt - a.savedAt).slice(MAX_COPIES);
                    await Promise.all(surplus.map((old) => request(store.delete(old.code))));
                });
            } catch {
                // Not kept: the list will not open offline, which is all that is lost
            }
        },
        load: async (code) => {
            try {
                return await within(factory, 'readonly', async (store) => (await request(store.get(code) as IDBRequest<Copy | undefined>)));
            } catch {
                return undefined;
            }
        },
        remove: async (code) => {
            try {
                await within(factory, 'readwrite', (store) => request(store.delete(code)));
            } catch {
                // Nothing to forget, or no way to: either way there is nothing to do
            }
        },
    };
}
