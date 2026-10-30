import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ValidationError } from '../../src/data/library.ts';
import { MemoryStore } from '../../src/data/memory-store.ts';
import {
    defaultTitle, inMassOrder, itemsOfPart, moveOptions, partIndex, positionInMass, recentFirst, Setlists, splitStarred,
} from '../../src/data/setlists.ts';
import { LIMITS, type Setlist, type SetlistItem } from '../../src/data/types.ts';
import { MASS_PARTS } from '../../src/mass.ts';
import { setlist, song } from './store.contract.ts';

const NOV_1 = new Date(2026, 10, 1, 9, 0).getTime();

describe('Setlists', () => {
    let store: MemoryStore;
    let now: number;
    let ids: number;
    let writes: number;
    let lists: Setlists;
    beforeEach(async () => {
        store = new MemoryStore();
        now = NOV_1;
        ids = 0;
        writes = 0;
        lists = new Setlists(store, () => writes++, () => now, () => `id-${ids++}`);
        await store.save('songs', song('s1', 1));
        await store.save('songs', song('s2', 1));
    });

    const itemsOf = async (id: string): Promise<SetlistItem[]> => [...((await lists.get(id))?.items ?? [])];
    const transposeOf = async (id: string, itemId: string): Promise<number | undefined> =>
        (await itemsOf(id)).find((item) => item.id === itemId)?.transpose;

    describe('creating', () => {
        it('starts for today, with a title made of the day, and queues it', async () => {
            const list = await lists.create();

            assert.deepEqual(list, {
                id: 'id-0', title: 'Misa del 1 de noviembre', eventDate: '2026-11-01', notes: '', starred: false, items: [],
                updatedAt: NOV_1, deletedAt: null,
            });
            assert.deepEqual(await store.pending('setlists'), [list]);
            assert.equal(writes, 1);
        });

        it('takes what the person gives, trimmed, and allows no date', async () => {
            const list = await lists.create({ title: '  Bodas  ', eventDate: null, notes: ' coro ' });

            assert.equal(list.title, 'Bodas');
            assert.equal(list.eventDate, null);
            assert.equal(list.notes, 'coro');
        });

        it('calls an undated list "Misa"', async () => {
            assert.equal((await lists.create({ eventDate: null })).title, 'Misa');
        });
    });

    describe('listing', () => {
        it('shows the most recently edited first, with or without a day, and hides the deleted', async () => {
            const first = await lists.create({ title: 'Primera', eventDate: '2026-12-25' });
            now += 1_000;
            const undated = await lists.create({ title: 'Sin fecha', eventDate: null });
            now += 1_000;
            const gone = await lists.create({ title: 'Borrada' });
            await lists.remove(gone.id);
            now += 1_000;
            await lists.update(first.id, { title: 'Primera, editada', eventDate: '2026-12-25', notes: '' });

            assert.deepEqual((await lists.list()).map((l) => l.id), [first.id, undated.id]);
        });

        it('breaks a tie of edits by id, so the order never flips', () => {
            const a = setlist('a', 10);
            const b = setlist('b', 10);

            assert.deepEqual([b, a].sort(recentFirst).map((l) => l.id), ['a', 'b']);
        });

        it('splits the starred (by title) from the rest (most recent first)', () => {
            const rosario = setlist('r', 5, { title: 'Rosario', starred: true });
            const avivamiento = setlist('v', 9, { title: 'Avivamiento', starred: true });
            const old = setlist('o', 1, { title: 'Misa vieja' });
            const recent = setlist('n', 7, { title: 'Misa nueva' });

            const { starred, others } = splitStarred([rosario, old, avivamiento, recent]);

            assert.deepEqual(starred.map((l) => l.id), ['v', 'r']);
            assert.deepEqual(others.map((l) => l.id), ['n', 'o']);
        });

        it('sorts starred titles the Spanish way (an accent is not after z)', () => {
            const { starred } = splitStarred([
                setlist('z', 1, { title: 'Zacarías', starred: true }),
                setlist('a', 1, { title: 'Ángeles', starred: true }),
                setlist('b', 1, { title: 'Bodas', starred: true }),
            ]);

            assert.deepEqual(starred.map((l) => l.id), ['a', 'b', 'z']);
        });
    });

    describe('starring', () => {
        it('stars and unstars with a newer stamp, and queues the change', async () => {
            const list = await lists.create({ title: 'Rosario', eventDate: null });
            now += 5_000;

            const starred = await lists.setStarred(list.id, true);

            assert.equal(starred.starred, true);
            assert.equal(starred.updatedAt, NOV_1 + 5_000);
            assert.equal((await lists.get(list.id))?.starred, true);
            assert.equal((await store.pending('setlists'))[0]?.starred, true);

            now += 1_000;
            assert.equal((await lists.setStarred(list.id, false)).starred, false);
        });

        it('keeps the star through other edits of the list', async () => {
            const list = await lists.create({ title: 'Rosario', eventDate: null });
            await lists.setStarred(list.id, true);
            now += 1_000;

            await lists.update(list.id, { title: 'Rosario en familia', eventDate: null, notes: '' });
            await lists.addItem(list.id, 'entrada', 's1');

            assert.equal((await lists.get(list.id))?.starred, true);
        });

        it('says so for a list that no longer exists', async () => {
            await assert.rejects(lists.setStarred('nope', true), /ya no existe/);
        });

        it('takes the star off a deleted list', async () => {
            const list = await lists.create();
            await lists.setStarred(list.id, true);
            now += 1_000;

            await lists.remove(list.id);

            assert.equal((await store.get('setlists', list.id))?.starred, false);
        });
    });

    describe('duplicating', () => {
        it('copies the songs in their parts and order, with the keys of the list, for today, starred no more', async () => {
            const source = await lists.create({ title: 'Misa del domingo', eventDate: '2026-10-25', notes: 'algo' });
            await lists.addItem(source.id, 'comunion', 's2');
            await lists.addItem(source.id, 'entrada', 's1');
            await lists.addItem(source.id, 'comunion', 's1');
            const [first] = await itemsOf(source.id);
            await lists.setTranspose(source.id, first?.id ?? '', 3);
            await lists.setStarred(source.id, true);

            const copy = await lists.duplicate(source.id);

            assert.notEqual(copy.id, source.id);
            assert.equal(copy.title, 'Misa del 1 de noviembre');
            assert.equal(copy.eventDate, '2026-11-01');
            assert.equal(copy.starred, false);
            assert.equal(copy.notes, '');
            assert.deepEqual(copy.items.map((item) => [item.part, item.songId, item.transpose, item.note]), [
                ['comunion', 's2', 3, ''], ['entrada', 's1', 0, ''], ['comunion', 's1', 0, ''],
            ]);
            const sourceIds = new Set((await itemsOf(source.id)).map((item) => item.id));
            assert.ok(copy.items.every((item) => !sourceIds.has(item.id)), 'its songs have ids of their own');
            assert.equal((await lists.get(source.id))?.starred, true, 'the original is left as it was');
            assert.deepEqual((await store.pending('setlists')).map((queued) => queued.id).includes(copy.id), true, 'it is queued to sync');
        });

        it('leaves out a song that was deleted since', async () => {
            const source = await lists.create();
            await lists.addItem(source.id, 'entrada', 's1');
            await lists.addItem(source.id, 'salida', 's2');
            await store.save('songs', { ...song('s2', 5), deletedAt: 5 });

            const copy = await lists.duplicate(source.id);

            assert.deepEqual(copy.items.map((item) => item.songId), ['s1']);
        });

        it('says so for a list that no longer exists', async () => {
            await assert.rejects(lists.duplicate('nope'), /ya no existe/);
            const gone = await lists.create();
            await lists.remove(gone.id);
            await assert.rejects(lists.duplicate(gone.id), /ya no existe/);
        });
    });

    describe('editing the header', () => {
        it('updates title, day and notes with a newer stamp', async () => {
            const list = await lists.create();
            now += 5_000;

            const edited = await lists.update(list.id, { title: ' Misa de difuntos ', eventDate: '2026-11-02', notes: 'Todos los santos' });

            assert.equal(edited.title, 'Misa de difuntos');
            assert.equal(edited.eventDate, '2026-11-02');
            assert.equal(edited.updatedAt, NOV_1 + 5_000);
            assert.equal((await lists.get(list.id))?.notes, 'Todos los santos');
        });

        it('keeps the items when only the header changes', async () => {
            const list = await lists.create();
            await lists.addItem(list.id, 'entrada', 's1');

            await lists.update(list.id, { title: 'Otro', eventDate: null, notes: '' });

            assert.equal((await itemsOf(list.id)).length, 1);
        });

        it('stamps strictly later even when the clock is behind', async () => {
            const list = await lists.create();
            now = 10;

            const edited = await lists.update(list.id, { title: 'Otro', eventDate: null, notes: '' });

            assert.equal(edited.updatedAt, list.updatedAt + 1);
        });

        const invalid: [string, { title: string; eventDate: string | null; notes: string }, RegExp][] = [
            ['an empty title', { title: '  ', eventDate: null, notes: '' }, /título/],
            ['a long title', { title: 'a'.repeat(LIMITS.title + 1), eventDate: null, notes: '' }, /título.*largo/],
            ['a day that does not exist', { title: 'x', eventDate: '2026-02-30', notes: '' }, /fecha/],
            ['long notes', { title: 'x', eventDate: null, notes: 'a'.repeat(LIMITS.notes + 1) }, /notas.*largas/],
        ];
        for (const [name, draft, message] of invalid) {
            it(`refuses ${name}, in Spanish, and changes nothing`, async () => {
                const list = await lists.create();
                const before = writes;

                // A rejected promise, never a throw: the screen handles it with .catch
                await assert.rejects(
                    lists.update(list.id, draft),
                    (e: unknown) => e instanceof ValidationError && message.test(e.message),
                );

                assert.deepEqual(await lists.get(list.id), list);
                assert.equal(writes, before);
            });
        }

        it('reports a refusal as a rejected promise, not as an exception thrown at the caller', () => {
            const outcome = lists.update('nope', { title: '', eventDate: null, notes: '' });

            assert.ok(outcome instanceof Promise);
            return assert.rejects(outcome, /título/);
        });

        it('refuses to edit a list that no longer exists', async () => {
            await assert.rejects(lists.update('nope', { title: 'x', eventDate: null, notes: '' }), /ya no existe/);
        });
    });

    describe('deleting', () => {
        it('leaves a tombstone without items or notes, and is idempotent', async () => {
            const list = await lists.create({ notes: 'secreto' });
            await lists.addItem(list.id, 'entrada', 's1');
            now += 1_000;

            await lists.remove(list.id);
            const tombstone = await store.get('setlists', list.id);
            now += 1_000;
            await lists.remove(list.id);
            await lists.remove('nope');

            assert.equal(await lists.get(list.id), undefined);
            assert.equal(tombstone?.deletedAt, NOV_1 + 1_000);
            assert.deepEqual(tombstone?.items, []);
            assert.equal(tombstone?.notes, '');
            assert.equal((await store.get('setlists', list.id))?.deletedAt, NOV_1 + 1_000, 'deleting twice changes nothing');
            assert.equal((await store.pending('setlists'))[0]?.deletedAt, NOV_1 + 1_000);
        });
    });

    describe('putting a removed song back', () => {
        it('puts it where it was among the items, so "Deshacer" leaves the list as it was', async () => {
            const list = await lists.create();
            await lists.addItem(list.id, 'entrada', 's1');
            await lists.addItem(list.id, 'comunion', 's2');
            await lists.addItem(list.id, 'comunion', 's1');
            const before = await itemsOf(list.id);
            const removed = before[1] as SetlistItem;

            await lists.removeItem(list.id, removed.id);
            assert.equal((await itemsOf(list.id)).length, 2);
            await lists.restoreItem(list.id, removed, 1);

            assert.deepEqual(await itemsOf(list.id), before);
        });

        it('does nothing when it is already there, so a second "Deshacer" cannot double it', async () => {
            const list = await lists.create();
            await lists.addItem(list.id, 'entrada', 's1');
            const [only] = await itemsOf(list.id);

            await lists.restoreItem(list.id, only as SetlistItem, 0);

            assert.equal((await itemsOf(list.id)).length, 1);
        });

        it('keeps the key of the song it puts back', async () => {
            const list = await lists.create();
            await lists.addItem(list.id, 'entrada', 's1');
            const [added] = await itemsOf(list.id);
            await lists.shiftItem(list.id, (added as SetlistItem).id, 3);
            const [shifted] = await itemsOf(list.id);
            await lists.removeItem(list.id, (shifted as SetlistItem).id);

            await lists.restoreItem(list.id, shifted as SetlistItem, 0);

            assert.equal((await itemsOf(list.id))[0]?.transpose, 3);
        });

        it('refuses to go past the most songs a list takes', async () => {
            const list = await lists.create();
            for (let n = 0; n < LIMITS.items; n++) {
                await lists.addItem(list.id, 'comunion', 's1');
            }

            await assert.rejects(
                lists.restoreItem(list.id, { id: 'extra', part: 'entrada', songId: 's1', transpose: 0, note: '' }, 0),
                ValidationError,
            );
        });
    });

    describe('a song whose written key moved', () => {
        it('moves every use of it the other way, so each sounds as it did, and leaves the other songs alone', async () => {
            const first = await lists.create();
            const second = await lists.create();
            await lists.addItem(first.id, 'entrada', 's1');
            await lists.addItem(first.id, 'salida', 's2');
            await lists.addItem(second.id, 'comunion', 's1');
            const [one, two] = await itemsOf(first.id);
            await lists.setTranspose(first.id, one?.id ?? '', 5);
            await lists.setTranspose(first.id, two?.id ?? '', 3);

            const touched = await lists.retuneSong('s1', 2);

            assert.equal(touched.length, 2);
            assert.deepEqual((await itemsOf(first.id)).map((item) => item.transpose), [3, 3]);
            assert.deepEqual((await itemsOf(second.id)).map((item) => item.transpose), [-2]);
        });

        it('keeps the shift the shortest way round', async () => {
            const list = await lists.create();
            await lists.addItem(list.id, 'entrada', 's1');
            const [only] = await itemsOf(list.id);
            await lists.setTranspose(list.id, only?.id ?? '', -5);

            await lists.retuneSong('s1', 3);

            assert.deepEqual((await itemsOf(list.id)).map((item) => item.transpose), [4]);
        });

        it('writes nothing for a song that is in no list', async () => {
            const before = writes;

            assert.deepEqual(await lists.retuneSong('s1', 2), []);
            assert.equal(writes, before);
        });
    });

    describe('adding songs', () => {
        it('starts a song in the key its owner sings it in, and keeps it when "mi tono" changes later', async () => {
            await store.save('songs', song('s3', 1, { myShift: 2 }));
            const list = await lists.create();

            await lists.addItem(list.id, 'entrada', 's3');
            await store.save('songs', song('s3', 2, { myShift: -4 }));
            await lists.addItem(list.id, 'salida', 's1');

            assert.deepEqual((await itemsOf(list.id)).map((item) => item.transpose), [2, 0]);
        });

        it('adds at the end of the part with no change of key, and one song can be there twice', async () => {
            const list = await lists.create();

            await lists.addItem(list.id, 'comunion', 's1');
            await lists.addItem(list.id, 'comunion', 's2');
            await lists.addItem(list.id, 'comunion', 's1');

            const items = await itemsOf(list.id);
            assert.deepEqual(items.map((i) => i.songId), ['s1', 's2', 's1']);
            assert.equal(new Set(items.map((i) => i.id)).size, 3);
            assert.ok(items.every((i) => i.part === 'comunion' && i.transpose === 0 && i.note === ''));
        });

        it('refuses a part that is not in the Mass, a song that does not exist and a deleted one', async () => {
            const list = await lists.create();
            await store.save('songs', song('dead', 5, { deletedAt: 5 }));

            await assert.rejects(lists.addItem(list.id, 'inventada', 's1'), /parte de la misa/);
            await assert.rejects(lists.addItem(list.id, 'entrada', 'nope'), /ya no existe/);
            await assert.rejects(lists.addItem(list.id, 'entrada', 'dead'), /ya no existe/);

            assert.deepEqual(await itemsOf(list.id), []);
        });

        it('refuses the 81st song', async () => {
            const list = await lists.create();
            for (let i = 0; i < LIMITS.items; i++) {
                await lists.addItem(list.id, MASS_PARTS[i % MASS_PARTS.length]?.id ?? 'entrada', 's1');
            }

            await assert.rejects(lists.addItem(list.id, 'entrada', 's1'), /hasta 80/);
            assert.equal((await itemsOf(list.id)).length, LIMITS.items);
        });

        it('does not touch the song itself', async () => {
            const before = await store.get('songs', 's1');
            const queued = await store.pending('songs');
            const list = await lists.create();
            const item = (await lists.addItem(list.id, 'entrada', 's1')).items[0];

            await lists.setTranspose(list.id, item?.id ?? '', 5);

            assert.deepEqual(await store.get('songs', 's1'), before);
            assert.deepEqual(await store.pending('songs'), queued, 'and it is not queued to be sent again');
        });
    });

    describe('changing an item', () => {
        let list: Setlist;
        let first: string;
        let second: string;
        let other: string;
        beforeEach(async () => {
            list = await lists.create();
            await lists.addItem(list.id, 'comunion', 's1');
            await lists.addItem(list.id, 'entrada', 's2');
            await lists.addItem(list.id, 'comunion', 's2');
            const items = await itemsOf(list.id);
            [first, other, second] = [items[0]?.id ?? '', items[1]?.id ?? '', items[2]?.id ?? ''];
        });

        it('removes an item', async () => {
            await lists.removeItem(list.id, first);

            assert.deepEqual((await itemsOf(list.id)).map((i) => i.id), [other, second]);
        });

        it('moves an item among those of its own part only', async () => {
            await lists.moveItem(list.id, second, -1);

            const items = await itemsOf(list.id);
            assert.deepEqual(itemsOfPart(items, 'comunion').map((i) => i.id), [second, first]);
            assert.deepEqual(itemsOfPart(items, 'entrada').map((i) => i.id), [other]);

            await lists.moveItem(list.id, second, 1);

            assert.deepEqual(itemsOfPart(await itemsOf(list.id), 'comunion').map((i) => i.id), [first, second]);
        });

        it('does nothing at the ends of a part or for an item that is not there', async () => {
            const before = await lists.get(list.id);

            await lists.moveItem(list.id, first, -1);
            await lists.moveItem(list.id, second, 1);
            await lists.moveItem(list.id, other, 1);
            await lists.moveItem(list.id, 'nope', 1);

            assert.deepEqual((await lists.get(list.id))?.items, before?.items);
        });

        it('shifts the key up and down, around the octave', async () => {
            await lists.shiftItem(list.id, first, 1);
            await lists.shiftItem(list.id, first, 1);
            assert.equal(await transposeOf(list.id, first), 2);

            await lists.shiftItem(list.id, first, -3);
            assert.equal(await transposeOf(list.id, first), -1);

            await lists.setTranspose(list.id, first, 11);
            await lists.shiftItem(list.id, first, 1);
            assert.equal(await transposeOf(list.id, first), 0, '11 + 1 comes round to the original key');

            await lists.setTranspose(list.id, first, -11);
            await lists.shiftItem(list.id, first, -1);
            assert.equal(await transposeOf(list.id, first), 0);
        });

        it('sets a key directly, kept within −11…11 and without "-0"', async () => {
            await lists.setTranspose(list.id, first, 14);
            assert.equal(await transposeOf(list.id, first), 2);
            await lists.setTranspose(list.id, first, -12);
            assert.ok(Object.is(await transposeOf(list.id, first), 0), 'plain zero');
            await lists.setTranspose(list.id, first, 0);
            assert.equal(await transposeOf(list.id, other), 0, 'other items are left alone');
        });

        it('counts two quick taps on "+" as two', async () => {
            await Promise.all([lists.shiftItem(list.id, first, 1), lists.shiftItem(list.id, first, 1), lists.shiftItem(list.id, first, 1)]);

            assert.equal(await transposeOf(list.id, first), 3);
            assert.equal((await lists.get(list.id))?.updatedAt, NOV_1 + 3 + 3, 'each one is a newer version');
        });

        it('keeps working after a change that failed', async () => {
            const failed = lists.addItem(list.id, 'no-existe', 's1');
            const fine = lists.shiftItem(list.id, first, 1);

            await assert.rejects(failed, /no existe/);
            await fine;

            assert.equal(await transposeOf(list.id, first), 1);
        });
    });

    describe('using a song', () => {
        it('finds the lists that have it, ignoring deleted lists', async () => {
            const a = await lists.create({ title: 'A' });
            const b = await lists.create({ title: 'B' });
            const c = await lists.create({ title: 'C' });
            await lists.addItem(a.id, 'entrada', 's1');
            await lists.addItem(b.id, 'entrada', 's2');
            await lists.addItem(c.id, 'salida', 's1');
            await lists.remove(c.id);

            assert.deepEqual((await lists.using('s1')).map((l) => l.title), ['A']);
            assert.deepEqual((await lists.using('nobody')), []);
        });
    });
});

describe('reading a list', () => {
    const item = (id: string, part: string): SetlistItem => ({ id, part, songId: 's', transpose: 0, note: '' });

    it('says which moves a song can make inside its own part', () => {
        const items = [item('a', 'comunion'), item('b', 'entrada'), item('c', 'comunion'), item('d', 'comunion')];

        assert.deepEqual(moveOptions(items, 'b'), { up: false, down: false }, 'alone in its part: no move at all');
        assert.deepEqual(moveOptions(items, 'a'), { up: false, down: true });
        assert.deepEqual(moveOptions(items, 'c'), { up: true, down: true });
        assert.deepEqual(moveOptions(items, 'd'), { up: true, down: false });
        assert.deepEqual(moveOptions(items, 'zzz'), { up: false, down: false }, 'an item that is gone has none');
    });

    it('numbers a song by its place in the order of the Mass, which is how singing names it', () => {
        const items = [item('1', 'salida'), item('2', 'comunion'), item('3', 'entrada')];

        assert.equal(positionInMass(items, '3'), 1);
        assert.equal(positionInMass(items, '2'), 2);
        assert.equal(positionInMass(items, '1'), 3);
        assert.equal(positionInMass(items, 'zzz'), 0);
    });

    it('puts the items in the order of the Missal, and keeps the order inside a part', () => {
        const items = [item('1', 'salida'), item('2', 'comunion'), item('3', 'entrada'), item('4', 'comunion'), item('5', 'gloria')];

        assert.deepEqual(inMassOrder(items).map((i) => i.id), ['3', '5', '2', '4', '1']);
    });

    it('sends a part this version does not know to the end instead of dropping it', () => {
        const items = [item('1', 'futura'), item('2', 'entrada')];

        assert.deepEqual(inMassOrder(items).map((i) => i.id), ['2', '1']);
        assert.equal(partIndex('futura'), MASS_PARTS.length);
        assert.equal(partIndex('entrada'), 0);
    });

    it('does not change the list it is given', () => {
        const items = [item('1', 'salida'), item('2', 'entrada')];

        inMassOrder(items);

        assert.deepEqual(items.map((i) => i.id), ['1', '2']);
    });

    it('names a new list after its day', () => {
        assert.equal(defaultTitle('2026-12-25'), 'Misa del 25 de diciembre');
    });
});
