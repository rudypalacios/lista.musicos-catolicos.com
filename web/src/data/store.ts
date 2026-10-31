import type { Collection, Pulled, Records } from './types.ts';

/**
 * What the app keeps on the device: the songs, the setlists and the templates, the ones not yet sent to the
 * server (`pending`, one entry per record, always the latest version), and where the last pull
 * stopped. They are collections with the same rules.
 *
 * Two implementations obey the same contract (test/data/store.contract.ts): IndexedDB in the
 * browser, and a Map for tests and for browsers without IndexedDB.
 */
export interface LocalStore {
    /** Every record of the collection, deleted ones included (tombstones) */
    all<C extends Collection>(collection: C): Promise<Records[C][]>;
    get<C extends Collection>(collection: C, id: string): Promise<Records[C] | undefined>;

    /** Writes the record and queues it for the server, as one step: both or neither */
    save<C extends Collection>(collection: C, record: Records[C]): Promise<void>;

    /** The records of the collection waiting to be sent */
    pending<C extends Collection>(collection: C): Promise<Records[C][]>;

    /**
     * Forgets the queued copies of `sent`, unless the record was edited again since: that
     * newer copy still has to go.
     */
    clearPending<C extends Collection>(collection: C, sent: readonly Records[C][]): Promise<void>;

    /**
     * Applies what a pull returned and moves the cursor, as one step (see shouldTakeRemote).
     * A pull that stops half way must not leave the cursor ahead of the records.
     */
    mergeRemote(page: Pick<Pulled, Collection>, cursor: number): Promise<void>;

    /** The change number the last pull reached, 0 before the first */
    cursor(): Promise<number>;

    /** Whose data this is (email), so another account never sees it */
    owner(): Promise<string | null>;
    setOwner(email: string): Promise<void>;

    /** Forgets everything: records, the queues, the cursor and the owner */
    clear(): Promise<void>;
}
