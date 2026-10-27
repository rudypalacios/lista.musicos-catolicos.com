/**
 * What every LocalStore must do. Run against the Map store and against IndexedDB (a fake one
 * in Node, the real one in the browser test), so they cannot drift apart.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { LocalStore } from '../../src/data/store.ts';
import type { Song } from '../../src/data/types.ts';

export function song(id: string, at: number, extra: Partial<Song> = {}): Song {
    return { id, title: `Canto ${id}`, author: '', body: `[G]${id}`, updatedAt: at, deletedAt: null, ...extra };
}

export function describeStore(name: string, create: () => Promise<LocalStore>): void {
    describe(`${name} (store contract)`, () => {
        let store: LocalStore;
        beforeEach(async () => {
            store = await create();
        });

        it('starts empty', async () => {
            assert.deepEqual(await store.allSongs(), []);
            assert.deepEqual(await store.pending(), []);
            assert.equal(await store.cursor(), 0);
            assert.equal(await store.owner(), null);
        });

        it('saves a song and queues it', async () => {
            await store.saveSong(song('a', 10));

            assert.deepEqual(await store.getSong('a'), song('a', 10));
            assert.deepEqual(await store.pending(), [song('a', 10)]);
        });

        it('keeps only the latest queued copy of a song', async () => {
            await store.saveSong(song('a', 10));
            await store.saveSong(song('a', 20, { title: 'Editado' }));

            assert.deepEqual(await store.pending(), [song('a', 20, { title: 'Editado' })]);
        });

        it('returns undefined for an unknown song', async () => {
            assert.equal(await store.getSong('nope'), undefined);
        });

        it('forgets what was sent, but not an edit made after it', async () => {
            await store.saveSong(song('a', 10));
            await store.saveSong(song('b', 10));
            const sent = [song('a', 10), song('b', 10)];
            await store.saveSong(song('b', 30)); // edited while the push was on its way

            await store.clearPending(sent);

            assert.deepEqual(await store.pending(), [song('b', 30)]);
        });

        it('takes songs from the server and moves the cursor', async () => {
            await store.mergeRemote([song('a', 10), song('b', 20)], 7);

            assert.equal((await store.allSongs()).length, 2);
            assert.deepEqual(await store.pending(), [], 'what came from the server is not sent back');
            assert.equal(await store.cursor(), 7);
        });

        it('never moves the cursor backwards', async () => {
            await store.mergeRemote([], 9);
            await store.mergeRemote([], 4);

            assert.equal(await store.cursor(), 9);
        });

        it('takes a newer server version over an older local one', async () => {
            await store.mergeRemote([song('a', 10)], 1);
            await store.mergeRemote([song('a', 20, { title: 'Del servidor' })], 2);

            assert.equal((await store.getSong('a'))?.title, 'Del servidor');
        });

        it('keeps a newer local edit that has not been sent', async () => {
            await store.saveSong(song('a', 50, { title: 'Mi edición' }));

            await store.mergeRemote([song('a', 20, { title: 'Viejo del servidor' })], 3);

            assert.equal((await store.getSong('a'))?.title, 'Mi edición');
            assert.deepEqual(await store.pending(), [song('a', 50, { title: 'Mi edición' })]);
        });

        it('drops the queued copy when the server holds a newer one', async () => {
            await store.saveSong(song('a', 10, { title: 'Mío, viejo' }));

            await store.mergeRemote([song('a', 90, { title: 'Del servidor, nuevo' })], 4);

            assert.equal((await store.getSong('a'))?.title, 'Del servidor, nuevo');
            assert.deepEqual(await store.pending(), []);
        });

        it('learns about a deletion made elsewhere', async () => {
            await store.mergeRemote([song('a', 10)], 1);

            await store.mergeRemote([song('a', 20, { body: '', deletedAt: 20 })], 2);

            assert.equal((await store.getSong('a'))?.deletedAt, 20);
        });

        it('remembers its owner', async () => {
            await store.setOwner('a@b.co');

            assert.equal(await store.owner(), 'a@b.co');
        });

        it('forgets everything on clear', async () => {
            await store.saveSong(song('a', 10));
            await store.mergeRemote([], 5);
            await store.setOwner('a@b.co');

            await store.clear();

            assert.deepEqual(await store.allSongs(), []);
            assert.deepEqual(await store.pending(), []);
            assert.equal(await store.cursor(), 0);
            assert.equal(await store.owner(), null);
        });
    });
}
