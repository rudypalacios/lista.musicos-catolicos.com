import type { ErrorKinds } from '../../src/data/sync.ts';
import type { Pulled, Pushed, Remote, Song } from '../../src/data/types.ts';

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
 * The server of the sync API in a few lines, with the same rules as src/Sync/SongRepository.php:
 * the newest `updatedAt` wins, an equal or older one is ignored, every applied change gets the
 * next number, a pull returns what changed after a number, oldest first.
 */
export class FakeServer {
    private rows = new Map<string, { song: Song; seq: number }>();
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
            push: (songs) => this.push(songs),
        };
    }

    songs(): Song[] {
        return [...this.rows.values()].map((row) => row.song);
    }

    private guard(): void {
        if (!this.online) {
            throw new FakeNetworkError('offline');
        }
        if (!this.signedIn) {
            throw new FakeSignedOut('401');
        }
    }

    private async push(songs: readonly Song[]): Promise<Pushed> {
        this.guard();
        this.pushes.push(songs.length);
        if (songs.some((song) => this.refuse.has(song.id))) {
            throw new FakeRefusal('400');
        }
        if (this.duringPush !== null) {
            const hook = this.duringPush;
            this.duringPush = null;
            await hook();
        }
        const applied: string[] = [];
        const ignored: string[] = [];
        for (const song of songs) {
            const existing = this.rows.get(song.id);
            if (existing !== undefined && song.updatedAt <= existing.song.updatedAt) {
                ignored.push(song.id);
                continue;
            }
            this.rows.set(song.id, { song, seq: ++this.counter });
            applied.push(song.id);
        }

        return { applied, ignored };
    }

    private pull(since: number): Promise<Pulled> {
        this.guard();
        const changed = [...this.rows.values()].filter((row) => row.seq > since).sort((a, b) => a.seq - b.seq);
        const page = changed.slice(0, this.pageSize);

        return Promise.resolve({
            songs: page.map((row) => row.song),
            cursor: page.length > 0 ? (page[page.length - 1]?.seq ?? since) : since,
            hasMore: changed.length > this.pageSize,
        });
    }
}
