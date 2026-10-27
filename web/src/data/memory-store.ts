import { shouldTakeRemote, supersedes } from './merge.ts';
import type { LocalStore } from './store.ts';
import type { Song } from './types.ts';

/** A store in memory: for tests, and the fallback when the browser has no IndexedDB */
export class MemoryStore implements LocalStore {
    private songs = new Map<string, Song>();
    private queue = new Map<string, Song>();
    private position = 0;
    private email: string | null = null;

    allSongs(): Promise<Song[]> {
        return Promise.resolve([...this.songs.values()]);
    }

    getSong(id: string): Promise<Song | undefined> {
        return Promise.resolve(this.songs.get(id));
    }

    saveSong(song: Song): Promise<void> {
        this.songs.set(song.id, song);
        this.queue.set(song.id, song);

        return Promise.resolve();
    }

    pending(): Promise<Song[]> {
        return Promise.resolve([...this.queue.values()]);
    }

    clearPending(sent: readonly Song[]): Promise<void> {
        for (const song of sent) {
            if (this.queue.get(song.id)?.updatedAt === song.updatedAt) {
                this.queue.delete(song.id);
            }
        }

        return Promise.resolve();
    }

    mergeRemote(songs: readonly Song[], cursor: number): Promise<void> {
        for (const remote of songs) {
            const pending = this.queue.get(remote.id);
            if (shouldTakeRemote(this.songs.get(remote.id), pending, remote)) {
                this.songs.set(remote.id, remote);
                if (supersedes(remote, pending)) {
                    this.queue.delete(remote.id);
                }
            }
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
        this.songs.clear();
        this.queue.clear();
        this.position = 0;
        this.email = null;

        return Promise.resolve();
    }
}
