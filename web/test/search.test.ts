import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterSetlists, filterSongs } from '../src/search.ts';
import type { Setlist, Song } from '../src/data/types.ts';

const song = (title: string, author = ''): Song => ({
    id: title, title, author, body: '', updatedAt: 1, deletedAt: null,
});
const songs = [song('Caminamos con alegría'), song('Ángel de Dios', 'Anónimo'), song('Dijiste Sí'), song('Padre nuestro', 'Martín Valverde')];

describe('filterSongs', () => {
    it('returns everything for an empty search', () => {
        assert.equal(filterSongs(songs, '').length, 4);
        assert.equal(filterSongs(songs, '   ').length, 4);
    });

    it('ignores accents and case', () => {
        assert.deepEqual(filterSongs(songs, 'ALEGRIA').map((s) => s.title), ['Caminamos con alegría']);
        assert.deepEqual(filterSongs(songs, 'angel').map((s) => s.title), ['Ángel de Dios']);
        assert.deepEqual(filterSongs(songs, 'si').map((s) => s.title), ['Dijiste Sí']);
    });

    it('needs every word, in any order', () => {
        assert.deepEqual(filterSongs(songs, 'dios angel').map((s) => s.title), ['Ángel de Dios']);
        assert.deepEqual(filterSongs(songs, 'dios zzz'), []);
    });

    it('looks in the author too', () => {
        assert.deepEqual(filterSongs(songs, 'valverde').map((s) => s.title), ['Padre nuestro']);
    });

    it('treats punctuation as a separator', () => {
        assert.deepEqual(filterSongs(songs, 'padre, nuestro!').map((s) => s.title), ['Padre nuestro']);
    });
});

describe('filterSetlists', () => {
    const list = (title: string, notes = ''): Setlist => ({
        id: title, title, eventDate: null, notes, starred: false, items: [], updatedAt: 1, deletedAt: null,
    });
    const lists = [list('Rosario en familia'), list('Misa del 1.º domingo de Adviento'), list('Avivamiento', 'jóvenes')];

    it('returns everything for an empty search', () => {
        assert.equal(filterSetlists(lists, '  ').length, 3);
    });

    it('ignores accents and case, and needs every word', () => {
        assert.deepEqual(filterSetlists(lists, 'ROSARIO').map((l) => l.title), ['Rosario en familia']);
        assert.deepEqual(filterSetlists(lists, 'adviento misa').map((l) => l.title), ['Misa del 1.º domingo de Adviento']);
        assert.deepEqual(filterSetlists(lists, 'rosario zzz'), []);
    });

    it('looks at the title only, not the notes', () => {
        assert.deepEqual(filterSetlists(lists, 'jovenes'), []);
    });
});
