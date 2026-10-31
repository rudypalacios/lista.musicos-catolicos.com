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
            id: 'id-0', title: 'Caminamos con alegría', author: 'Anónimo', body: '[C]Caminamos', tags: [], myShift: 0, updatedAt: 1000, deletedAt: null,
        });
        assert.deepEqual(await store.pending('songs'), [song]);
    });

    describe('tags', () => {
        const draft = { title: 'Uno', author: '', body: '[C]a' };

        it('are kept clean on a new song: trimmed, one spelling each', async () => {
            const song = await library.create({ ...draft, tags: ['  Entrada ', 'entrada', 'Comunión', '  '] });

            assert.deepEqual(song.tags, ['Entrada', 'Comunión']);
        });

        it('stay as they are when an edit does not mention them, and are replaced when it does', async () => {
            const song = await library.create({ ...draft, tags: ['Entrada'] });
            now = 2_000;

            const edited = await library.update(song.id, { ...draft, title: 'Uno editado' });
            assert.deepEqual(edited.tags, ['Entrada']);

            now = 3_000;
            const retagged = await library.update(song.id, { ...draft, tags: ['Salida'] });
            assert.deepEqual(retagged.tags, ['Salida']);
            const cleared = await library.update(song.id, { ...draft, tags: [] });
            assert.deepEqual(cleared.tags, []);
        });

        it('are set on their own with a newer stamp, and nothing is written when they do not change', async () => {
            const song = await library.create({ ...draft, tags: ['Entrada'] });
            now = 5_000;

            const same = await library.setTags(song.id, ['entrada']);
            assert.equal(same.updatedAt, 1000, 'the same tag in another spelling is no change');
            assert.equal((await store.pending('songs'))[0]?.updatedAt, 1000);

            const more = await library.setTags(song.id, ['Entrada', 'Adviento']);
            assert.deepEqual(more.tags, ['Entrada', 'Adviento']);
            assert.equal(more.updatedAt, 5000);
            assert.deepEqual((await store.pending('songs'))[0], more);
        });

        it('refuse more than eight or one too long, and the song is as it was', async () => {
            const song = await library.create(draft);

            await assert.rejects(library.setTags(song.id, Array.from({ length: LIMITS.tags + 1 }, (_, i) => `T${i}`)), /hasta 8 etiquetas/);
            await assert.rejects(library.setTags(song.id, ['x'.repeat(LIMITS.tag + 1)]), /hasta 30 caracteres/);
            await assert.rejects(library.create({ ...draft, tags: ['x'.repeat(LIMITS.tag + 1)] }), ValidationError);
            assert.deepEqual((await library.get(song.id))?.tags, []);
        });

        it('are added to several songs at once: only the songs that lack the tag change, and it can be taken off again', async () => {
            const a = await library.create({ ...draft, title: 'A' });
            const b = await library.create({ ...draft, title: 'B', tags: ['Entrada'] });
            const c = await library.create({ ...draft, title: 'C', tags: ['Adviento'] });
            now = 9_000;

            const changed = await library.addTag([a.id, b.id, c.id, 'gone'], 'entrada');

            assert.deepEqual(changed.map((song) => song.title), ['A', 'C'], 'B had it (in another spelling); a song that is gone is skipped');
            assert.deepEqual((await library.get(c.id))?.tags, ['Adviento', 'entrada'], 'the other tags stay');
            assert.equal((await library.get(b.id))?.updatedAt, 1000, 'what was not changed was not written');

            const undone = await library.removeTag(changed.map((song) => song.id), 'Entrada');

            assert.deepEqual(undone.map((song) => song.title), ['A', 'C']);
            assert.deepEqual((await library.get(a.id))?.tags, []);
            assert.deepEqual((await library.get(c.id))?.tags, ['Adviento']);
        });

        it('are not added to a song that already has eight', async () => {
            const full = await library.create({ ...draft, tags: Array.from({ length: LIMITS.tags }, (_, i) => `T${i}`) });

            assert.deepEqual(await library.addTag([full.id], 'Más'), []);
        });

        it('read as none on a song saved before the tags', async () => {
            await store.save('songs', { id: 'old', title: 'Viejo', author: '', body: '', myShift: 0, updatedAt: 1, deletedAt: null } as never);

            assert.deepEqual((await library.get('old'))?.tags, []);
            assert.deepEqual((await library.list())[0]?.tags, []);
        });
    });

    describe('"mi tono"', () => {
        it('starts at 0, the written key', async () => {
            const song = await library.create({ title: 'Uno', author: '', body: '[C]a' });

            assert.equal(song.myShift, 0);
        });

        it('is set with a newer stamp and queued, and the song keeps its text', async () => {
            const song = await library.create({ title: 'Uno', author: '', body: '[C]a' });
            now = 5_000;

            const mine = await library.setMyShift(song.id, 2);

            assert.equal(mine.myShift, 2);
            assert.equal(mine.updatedAt, 5000);
            assert.equal((await library.get(song.id))?.body, '[C]a');
            assert.deepEqual((await store.pending('songs')).map((queued) => queued.myShift), [2]);
        });

        it('survives an edit of the song', async () => {
            const song = await library.create({ title: 'Uno', author: '', body: 'a' });
            await library.setMyShift(song.id, -3);

            const edited = await library.update(song.id, { title: 'Uno bis', author: '', body: 'b' });

            assert.equal(edited.myShift, -3);
        });

        it('writes nothing when it is already that', async () => {
            const song = await library.create({ title: 'Uno', author: '', body: 'a' });
            const first = await library.setMyShift(song.id, 4);
            now = 9_000;

            const again = await library.setMyShift(song.id, 4);

            assert.equal(again.updatedAt, first.updatedAt);
        });

        it('refuses a key beyond an octave or not a whole number, and a song that is gone', async () => {
            const song = await library.create({ title: 'Uno', author: '', body: 'a' });

            await assert.rejects(library.setMyShift(song.id, 12), ValidationError);
            await assert.rejects(library.setMyShift(song.id, 1.5), ValidationError);
            await assert.rejects(library.setMyShift('nope', 1), /ya no existe/);
        });

        it('reads a song saved before "mi tono" as 0', async () => {
            const { myShift: _unused, ...old } = (await library.create({ title: 'Viejo', author: '', body: 'a' }));
            await store.save('songs', old as never);

            assert.equal((await library.list())[0]?.myShift, 0);
            assert.equal((await library.get('id-0'))?.myShift, 0);
        });
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
