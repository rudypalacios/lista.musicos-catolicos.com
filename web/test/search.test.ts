import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterSongs } from '../src/search.ts';
import type { Song } from '../src/data/types.ts';

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
