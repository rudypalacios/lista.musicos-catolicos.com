import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { asSong, bySection, countLabel, keyOf, readingOrder, updatedLabel, type SharedList } from '../src/shared-model.ts';

const list = (): SharedList => ({
    title: 'Misa',
    withLyrics: true,
    updatedAt: Date.UTC(2026, 9, 31, 15),
    parts: [{ id: 'entrada', name: 'Canto de entrada' }, { id: 'gloria', name: 'Gloria' }, { id: 'salida', name: 'Salida' }],
    items: [
        { id: 'i1', part: 'gloria', songId: 's2', transpose: 0 },
        { id: 'i2', part: 'entrada', songId: 's1', transpose: 2 },
        { id: 'i3', part: 'entrada', songId: 's3', transpose: 0 },
        { id: 'i4', part: 'salida', songId: 'missing', transpose: 0 },
    ],
    songs: [
        { id: 's1', title: 'Uno', author: 'Ana', body: '{key: C}\n[C]Uno' },
        { id: 's2', title: 'Dos', author: '', body: '[G]Dos' },
        { id: 's3', title: 'Tres', author: '', body: 'sin acordes' },
    ],
});

describe('readingOrder', () => {
    it('orders by section and keeps the order inside one, numbering from 1', () => {
        const rows = readingOrder(list());
        assert.deepEqual(rows.map((row) => [row.n, row.song.id, row.part.id]), [[1, 's1', 'entrada'], [2, 's3', 'entrada'], [3, 's2', 'gloria']]);
    });

    it('leaves out an item whose song is not in the list (it was deleted)', () => {
        assert.ok(!readingOrder(list()).some((row) => row.item.id === 'i4'));
    });

    it('is empty for a list with nothing in it', () => {
        assert.deepEqual(readingOrder({ ...list(), items: [] }), []);
    });
});

describe('bySection', () => {
    it('groups the rows under their sections and leaves the empty ones out', () => {
        const groups = bySection(readingOrder(list()));
        assert.deepEqual(groups.map((group) => [group.part.name, group.rows.map((row) => row.song.title)]), [
            ['Canto de entrada', ['Uno', 'Tres']],
            ['Gloria', ['Dos']],
        ]);
    });
});

describe('keyOf', () => {
    it('is the song\'s key moved by the list\'s, in the notation asked', () => {
        const [first] = list().songs;
        assert.ok(first !== undefined);
        assert.equal(keyOf(first, 0, 'english'), 'C');
        assert.equal(keyOf(first, 2, 'english'), 'D');
        assert.equal(keyOf(first, 2, 'latin'), 'Re');
    });

    it('is null for a song with no key and for a list shared with no lyrics', () => {
        const songs = list().songs;
        assert.equal(keyOf(songs[2] as (typeof songs)[number], 0, 'latin'), null);
        assert.equal(keyOf({ id: 'x', title: 'x', author: '' }, 0, 'latin'), null);
    });
});

describe('asSong', () => {
    it('is a song for the printing, with nothing of the visitor\'s own', () => {
        const song = asSong({ id: 's', title: 'T', author: 'A', body: '[C]x' }, 5);
        assert.deepEqual([song.id, song.title, song.author, song.body, song.tags, song.myShift, song.deletedAt], ['s', 'T', 'A', '[C]x', [], 0, null]);
        assert.equal(asSong({ id: 's', title: 'T', author: '' }, 5).body, '');
    });
});

describe('labels', () => {
    it('counts songs and names the day the list changed', () => {
        assert.equal(countLabel(1), '1 canto');
        assert.equal(countLabel(12), '12 cantos');
        assert.match(updatedLabel(Date.UTC(2026, 9, 31, 15)), /^31 de octubre$/);
    });
});
