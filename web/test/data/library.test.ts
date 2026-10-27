import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Library, ValidationError } from '../../src/data/library.ts';
import { MemoryStore } from '../../src/data/memory-store.ts';
import { LIMITS } from '../../src/data/types.ts';

describe('Library', () => {
    let store: MemoryStore;
    let now: number;
    let library: Library;
    let ids: number;
    beforeEach(() => {
        store = new MemoryStore();
        now = 1_000;
        ids = 0;
        library = new Library(store, () => now, () => `id-${ids++}`);
    });

    it('creates a song with the clock and queues it', async () => {
        const song = await library.create({ title: '  Caminamos con alegría ', author: ' Anónimo ', body: '[C]Caminamos' });

        assert.deepEqual(song, {
            id: 'id-0', title: 'Caminamos con alegría', author: 'Anónimo', body: '[C]Caminamos', updatedAt: 1000, deletedAt: null,
        });
        assert.deepEqual(await store.pending('songs'), [song]);
    });

    it('lists by title in Spanish order, without the deleted ones', async () => {
        for (const title of ['Zacarías', 'Ángel de Dios', 'Bendito', 'ave maría']) {
            await library.create({ title, author: '', body: '' });
        }
        const gone = await library.create({ title: 'Borrado', author: '', body: '' });
        await library.remove(gone.id);

        assert.deepEqual((await library.list()).map((s) => s.title), ['Ángel de Dios', 'ave maría', 'Bendito', 'Zacarías']);
    });

    it('updates a song with a newer stamp', async () => {
        const song = await library.create({ title: 'Uno', author: '', body: 'a' });
        now = 5_000;

        const edited = await library.update(song.id, { title: 'Uno bis', author: '', body: 'b' });

        assert.equal(edited.id, song.id);
        assert.equal(edited.updatedAt, 5000);
        assert.equal((await library.get(song.id))?.body, 'b');
    });

    it('stamps strictly later even when the clock is behind', async () => {
        const song = await library.create({ title: 'Uno', author: '', body: 'a' });
        now = 10; // the device clock went back

        const edited = await library.update(song.id, { title: 'Uno', author: '', body: 'b' });

        assert.equal(edited.updatedAt, song.updatedAt + 1);
    });

    it('deletes by leaving a tombstone without the lyrics', async () => {
        const song = await library.create({ title: 'Uno', author: '', body: '[G]secreto' });
        now = 2_000;

        await library.remove(song.id);

        assert.equal(await library.get(song.id), undefined);
        const tombstone = await store.get('songs', song.id);
        assert.equal(tombstone?.deletedAt, 2000);
        assert.equal(tombstone?.body, '');
        assert.equal((await store.pending('songs'))[0]?.deletedAt, 2000);
    });

    it('ignores deleting what is not there or already gone', async () => {
        await library.remove('nope');
        const song = await library.create({ title: 'Uno', author: '', body: '' });
        await library.remove(song.id);
        const deletedAt = (await store.get('songs', song.id))?.deletedAt;
        now = 9_000;
        await library.remove(song.id);

        assert.equal(deletedAt, 1001, 'stamped just after the song it deletes');
        assert.equal((await store.get('songs', song.id))?.deletedAt, deletedAt, 'deleting twice changes nothing');
    });

    it('refuses to edit a song that no longer exists', async () => {
        await assert.rejects(library.update('nope', { title: 'x', author: '', body: '' }), /ya no existe/);
    });

    const invalid: [string, { title: string; author: string; body: string }, RegExp][] = [
        ['an empty title', { title: '   ', author: '', body: '' }, /título/],
        ['a long title', { title: 'a'.repeat(LIMITS.title + 1), author: '', body: '' }, /título.*largo/],
        ['a long author', { title: 'x', author: 'a'.repeat(LIMITS.author + 1), body: '' }, /autor.*largo/],
        ['a huge body', { title: 'x', author: '', body: 'a'.repeat(LIMITS.body + 1) }, /letra/],
        ['a body of multibyte letters over the byte limit', { title: 'x', author: '', body: 'ñ'.repeat(LIMITS.body / 2 + 1) }, /letra/],
    ];
    for (const [name, draft, message] of invalid) {
        it(`refuses ${name}, in Spanish`, async () => {
            await assert.rejects(library.create(draft), (e: unknown) => e instanceof ValidationError && message.test(e.message));
            assert.deepEqual(await store.pending('songs'), []);
        });
    }

    it('counts the title in characters, not bytes', async () => {
        const song = await library.create({ title: 'ñ'.repeat(LIMITS.title), author: '', body: '' });

        assert.equal(Array.from(song.title).length, LIMITS.title);
    });
});
