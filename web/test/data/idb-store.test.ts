import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { IdbStore } from '../../src/data/idb-store.ts';
import { describeStore, setlist, song } from './store.contract.ts';

// A fresh fake IndexedDB per store: nothing leaks between tests
describeStore('IdbStore', () => IdbStore.open(new IDBFactory(), 'test'));

describe('IdbStore persistence', () => {
    it('keeps its data when the database is closed and opened again, as after a reload', async () => {
        const factory = new IDBFactory();
        const first = await IdbStore.open(factory, 'persist');
        await first.save('songs', song('a', 10));
        await first.save('setlists', setlist('l', 11));
        await first.mergeRemote({ songs: [], setlists: [], templates: [] }, 3);
        await first.setOwner('a@b.co');
        first.close();

        const second = await IdbStore.open(factory, 'persist');

        assert.deepEqual(await second.get('songs', 'a'), song('a', 10));
        assert.deepEqual(await second.pending('songs'), [song('a', 10)]);
        assert.deepEqual(await second.get('setlists', 'l'), setlist('l', 11));
        assert.deepEqual(await second.pending('setlists'), [setlist('l', 11)]);
        assert.equal(await second.cursor(), 3);
        assert.equal(await second.owner(), 'a@b.co');
    });

    it('is separate per database name', async () => {
        const factory = new IDBFactory();
        const one = await IdbStore.open(factory, 'one');
        const two = await IdbStore.open(factory, 'two');

        await one.save('songs', song('a', 10));

        assert.deepEqual(await two.all('songs'), []);
    });
});

/** A database as version 1 of the app left it: songs, their queue and meta, no setlists */
function openVersion1(factory: IDBFactory, name: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(name, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore('songs', { keyPath: 'id' });
            db.createObjectStore('pending', { keyPath: 'id' });
            db.createObjectStore('meta', { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function put(db: IDBDatabase, store: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

describe('IdbStore upgrade from version 1', () => {
    it('keeps the songs and their queue, adds the setlists, and starts pulling again from zero', async () => {
        const factory = new IDBFactory();
        const old = await openVersion1(factory, 'upgrade');
        await put(old, 'songs', song('a', 10));
        await put(old, 'pending', song('b', 20));
        await put(old, 'meta', { key: 'cursor', value: 41 });
        await put(old, 'meta', { key: 'owner', value: 'a@b.co' });
        old.close();

        const store = await IdbStore.open(factory, 'upgrade');

        assert.deepEqual(await store.get('songs', 'a'), song('a', 10), 'the songs are still there');
        assert.deepEqual(await store.pending('songs'), [song('b', 20)], 'and so is what was not sent');
        assert.equal(await store.owner(), 'a@b.co');
        // A cursor of version 1 may have gone past setlists that version could not read
        assert.equal(await store.cursor(), 0);
        assert.deepEqual(await store.all('setlists'), []);
        await store.save('setlists', setlist('l', 30));
        assert.deepEqual(await store.pending('setlists'), [setlist('l', 30)]);
    });

    it('waits, and says so, while a window of the old version still holds the database', async () => {
        const factory = new IDBFactory();
        const old = await openVersion1(factory, 'blocked');
        await put(old, 'songs', song('a', 10));
        let warned = 0;

        const opening = IdbStore.open(factory, 'blocked', () => warned++);
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(warned, 1, 'the person is told to close the other window');

        old.close();
        const store = await opening;

        assert.deepEqual(await store.get('songs', 'a'), song('a', 10));
    });

    it('does not reset the cursor, or drop the lists, when the database is already the current version', async () => {
        const factory = new IDBFactory();
        const first = await IdbStore.open(factory, 'v2');
        await first.mergeRemote({ songs: [], setlists: [], templates: [] }, 12);
        first.close();

        const second = await IdbStore.open(factory, 'v2');

        assert.equal(await second.cursor(), 12);
    });
});

describe('IdbStore upgrade from version 2 (lists without sections)', () => {
    /** A database as version 2 left it: songs and setlists, each with its queue */
    function openVersion2(factory: IDBFactory, name: string): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = factory.open(name, 2);
            request.onupgradeneeded = () => {
                const db = request.result;
                for (const store of ['songs', 'pending', 'setlists', 'pending-setlists']) {
                    db.createObjectStore(store, { keyPath: 'id' });
                }
                db.createObjectStore('meta', { keyPath: 'key' });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    it('drops the lists and the lists waiting to be sent, keeps the songs and what was not sent, and pulls again from zero', async () => {
        const factory = new IDBFactory();
        const old = await openVersion2(factory, 'v2-to-v3');
        await put(old, 'songs', song('a', 10));
        await put(old, 'pending', song('b', 20));
        await put(old, 'setlists', { ...setlist('l', 30), parts: undefined });
        await put(old, 'pending-setlists', { ...setlist('l', 30), parts: undefined });
        await put(old, 'meta', { key: 'cursor', value: 41 });
        await put(old, 'meta', { key: 'owner', value: 'a@b.co' });
        old.close();

        const store = await IdbStore.open(factory, 'v2-to-v3');

        assert.deepEqual(await store.all('setlists'), [], 'a list with no sections would be refused by the server');
        assert.deepEqual(await store.pending('setlists'), []);
        assert.deepEqual(await store.get('songs', 'a'), song('a', 10));
        assert.deepEqual(await store.pending('songs'), [song('b', 20)]);
        assert.equal(await store.owner(), 'a@b.co');
        assert.equal(await store.cursor(), 0, 'the songs come back from the server as they are');
    });
});
