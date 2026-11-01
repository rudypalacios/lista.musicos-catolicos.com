import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { MAX_COPIES, openCopies } from '../src/shared-store.ts';
import type { SharedList } from '../src/shared-model.ts';

const list = (title: string): SharedList => ({
    title, withLyrics: true, updatedAt: 1, parts: [{ id: 'entrada', name: 'Entrada' }],
    items: [{ id: 'i', part: 'entrada', songId: 's', transpose: 2 }], songs: [{ id: 's', title: 'Uno', author: 'Ana', body: '[C]Uno' }],
});
const code = (n: number): string => String(n).padStart(32, '0');

describe('the copies of shared lists', () => {
    it('keeps a list as it came and says when', async () => {
        const copies = openCopies(new IDBFactory());
        await copies.save(code(1), list('Misa'), 1_700_000_000_000);

        assert.deepEqual(await copies.load(code(1)), { code: code(1), list: list('Misa'), savedAt: 1_700_000_000_000 });
        assert.equal(await copies.load(code(2)), undefined, 'a list that was never opened has no copy');
    });

    it('replaces the copy when the list is opened again', async () => {
        const copies = openCopies(new IDBFactory());
        await copies.save(code(1), list('Antes'), 10);
        await copies.save(code(1), list('Después'), 20);

        assert.equal((await copies.load(code(1)))?.list.title, 'Después');
        assert.equal((await copies.load(code(1)))?.savedAt, 20);
    });

    it('forgets a copy (the link was stopped), and forgetting one that is not there is fine', async () => {
        const copies = openCopies(new IDBFactory());
        await copies.save(code(1), list('Misa'), 10);

        await copies.remove(code(1));
        await copies.remove(code(1));

        assert.equal(await copies.load(code(1)), undefined);
    });

    it('is still there after the database is closed and opened again, as after a reload', async () => {
        const factory = new IDBFactory();
        await openCopies(factory).save(code(1), list('Misa'), 10);

        assert.equal((await openCopies(factory).load(code(1)))?.list.title, 'Misa');
    });

    it(`keeps the newest ${MAX_COPIES} and drops the oldest`, async () => {
        const copies = openCopies(new IDBFactory());
        for (let n = 1; n <= MAX_COPIES + 3; n++) {
            await copies.save(code(n), list(`Lista ${n}`), n);
        }

        for (const gone of [1, 2, 3]) {
            assert.equal(await copies.load(code(gone)), undefined, `list ${gone}`);
        }
        for (const kept of [4, MAX_COPIES + 3]) {
            assert.equal((await copies.load(code(kept)))?.list.title, `Lista ${kept}`);
        }
    });

    it('is not an error when the browser has no IndexedDB, or refuses it', async () => {
        const none = openCopies(undefined);
        await none.save(code(1), list('Misa'));
        assert.equal(await none.load(code(1)), undefined);
        await none.remove(code(1));

        const broken = { open: () => { throw new Error('refused'); } } as unknown as IDBFactory;
        const refusing = openCopies(broken);
        await refusing.save(code(1), list('Misa'));
        assert.equal(await refusing.load(code(1)), undefined);
        await refusing.remove(code(1));
    });
});
