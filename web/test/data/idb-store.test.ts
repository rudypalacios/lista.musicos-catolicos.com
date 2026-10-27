import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { IdbStore } from '../../src/data/idb-store.ts';
import { describeStore, song } from './store.contract.ts';

// A fresh fake IndexedDB per store: nothing leaks between tests
describeStore('IdbStore', () => IdbStore.open(new IDBFactory(), 'test'));

describe('IdbStore persistence', () => {
    it('keeps its data when the database is closed and opened again, as after a reload', async () => {
        const factory = new IDBFactory();
        const first = await IdbStore.open(factory, 'persist');
        await first.saveSong(song('a', 10));
        await first.mergeRemote([], 3);
        await first.setOwner('a@b.co');
        first.close();

        const second = await IdbStore.open(factory, 'persist');

        assert.deepEqual(await second.getSong('a'), song('a', 10));
        assert.deepEqual(await second.pending(), [song('a', 10)]);
        assert.equal(await second.cursor(), 3);
        assert.equal(await second.owner(), 'a@b.co');
    });

    it('is separate per database name', async () => {
        const factory = new IDBFactory();
        const one = await IdbStore.open(factory, 'one');
        const two = await IdbStore.open(factory, 'two');

        await one.saveSong(song('a', 10));

        assert.deepEqual(await two.allSongs(), []);
    });
});
