import { shouldTakeRemote, supersedes } from './merge.ts';
import type { LocalStore } from './store.ts';
import { COLLECTIONS, type Collection, type Pulled, type Records } from './types.ts';

/** A store in memory: for tests, and the fallback when the browser has no IndexedDB */
export class MemoryStore implements LocalStore {
    private data = newTables();
    private queues = newTables();
    private position = 0;
    private email: string | null = null;

    all<C extends Collection>(collection: C): Promise<Records[C][]> {
        return Promise.resolve([...this.table(this.data, collection).values()]);
    }

    get<C extends Collection>(collection: C, id: string): Promise<Records[C] | undefined> {
        return Promise.resolve(this.table(this.data, collection).get(id));
    }

    save<C extends Collection>(collection: C, record: Records[C]): Promise<void> {
        this.table(this.data, collection).set(record.id, record);
        this.table(this.queues, collection).set(record.id, record);

        return Promise.resolve();
    }

    pending<C extends Collection>(collection: C): Promise<Records[C][]> {
        return Promise.resolve([...this.table(this.queues, collection).values()]);
    }

    clearPending<C extends Collection>(collection: C, sent: readonly Records[C][]): Promise<void> {
        const queue = this.table(this.queues, collection);
        for (const record of sent) {
            if (queue.get(record.id)?.updatedAt === record.updatedAt) {
                queue.delete(record.id);
            }
        }

        return Promise.resolve();
    }

    mergeRemote(page: Pick<Pulled, Collection>, cursor: number): Promise<void> {
        for (const collection of COLLECTIONS) {
            this.mergeInto(collection, page[collection]);
        }
        this.position = Math.max(this.position, cursor);

        return Promise.resolve();
    }

    cursor(): Promise<number> {
        return Promise.resolve(this.position);
    }

    owner(): Promise<string | null> {
        return Promise.resolve(this.email);
    }

    setOwner(email: string): Promise<void> {
        this.email = email;

        return Promise.resolve();
    }

    clear(): Promise<void> {
        this.data = newTables();
        this.queues = newTables();
        this.position = 0;
        this.email = null;

        return Promise.resolve();
    }

    private mergeInto<C extends Collection>(collection: C, remotes: readonly Records[C][]): void {
        const records = this.table(this.data, collection);
        const queue = this.table(this.queues, collection);
        for (const remote of remotes) {
            const pending = queue.get(remote.id);
            if (shouldTakeRemote(records.get(remote.id), pending, remote)) {
                records.set(remote.id, remote);
                if (supersedes(remote, pending)) {
                    queue.delete(remote.id);
                }
            }
        }
    }

    private table<C extends Collection>(tables: Tables, collection: C): Map<string, Records[C]> {
        return tables[collection] as Map<string, Records[C]>;
    }
}

type Tables = { [C in Collection]: Map<string, Records[C]> };

function newTables(): Tables {
    return { songs: new Map(), setlists: new Map(), templates: new Map() };
}
