import type { ErrorKinds } from '../../src/data/sync.ts';
import type { Collection, Pulled, Pushed, Records, Remote, Setlist, Song } from '../../src/data/types.ts';

/** What the fake remote throws; the engine recognises them through FAKE_ERRORS */
export class FakeNetworkError extends Error {}
export class FakeSignedOut extends Error {}
export class FakeRefusal extends Error {}

export const FAKE_ERRORS: ErrorKinds = {
    isOffline: (error) => error instanceof FakeNetworkError,
    isSignedOut: (error) => error instanceof FakeSignedOut,
    isRefusal: (error) => error instanceof FakeRefusal,
};

/**
 * The server of the sync API in a few lines, with the same rules as src/Sync/SongRepository.php
 * and SetlistRepository.php: the newest `updatedAt` wins, an equal or older one is ignored,
 * every applied change gets the next number (one counter for songs and setlists), a pull
 * returns what changed after a number, oldest first, songs and setlists in one page.
 */
export class FakeServer {
    private rows: { [C in Collection]: Map<string, { record: Records[C]; seq: number }> } = {
        songs: new Map(),
        setlists: new Map(),
    };
    private counter = 0;
    online = true;
    signedIn = true;
    /** Ids the server refuses (HTTP 400), however they are sent */
    refuse = new Set<string>();
    pageSize = 200;
    /** Runs while a push is on its way, to simulate an edit made meanwhile */
    duringPush: (() => Promise<void>) | null = null;
    pushes: number[] = [];

    remote(): Remote {
        return {
            pull: (since) => this.pull(since),
            push: (collection, records) => this.push(collection, records),
        };
    }

    songs(): Song[] {
        return [...this.rows.songs.values()].map((row) => row.record);
    }

    setlists(): Setlist[] {
        return [...this.rows.setlists.values()].map((row) => row.record);
    }

    private guard(): void {
        if (!this.online) {
            throw new FakeNetworkError('offline');
        }
        if (!this.signedIn) {
            throw new FakeSignedOut('401');
        }
    }

    private async push<C extends Collection>(collection: C, records: readonly Records[C][]): Promise<Pushed> {
        this.guard();
        this.pushes.push(records.length);
        if (records.some((record) => this.refuse.has(record.id))) {
            throw new FakeRefusal('400');
        }
        if (this.duringPush !== null) {
            const hook = this.duringPush;
            this.duringPush = null;
            await hook();
        }
        const table = this.rows[collection] as Map<string, { record: Records[C]; seq: number }>;
        const applied: string[] = [];
        const ignored: string[] = [];
        for (const record of records) {
            const existing = table.get(record.id);
            if (existing !== undefined && record.updatedAt <= existing.record.updatedAt) {
                ignored.push(record.id);
                continue;
            }
            table.set(record.id, { record, seq: ++this.counter });
            applied.push(record.id);
        }

        return { applied, ignored };
    }

    private pull(since: number): Promise<Pulled> {
        this.guard();
        const changed = [
            ...[...this.rows.songs.values()].map((row) => ({ kind: 'songs' as const, record: row.record, seq: row.seq })),
            ...[...this.rows.setlists.values()].map((row) => ({ kind: 'setlists' as const, record: row.record, seq: row.seq })),
        ]
            .filter((row) => row.seq > since)
            .sort((a, b) => a.seq - b.seq);
        const page = changed.slice(0, this.pageSize);
        const pulled: Pulled = {
            songs: [],
            setlists: [],
            cursor: page.length > 0 ? (page[page.length - 1]?.seq ?? since) : since,
            hasMore: changed.length > this.pageSize,
        };
        for (const row of page) {
            if (row.kind === 'songs') {
                pulled.songs.push(row.record);
            } else {
                pulled.setlists.push(row.record);
            }
        }

        return Promise.resolve(pulled);
    }
}
