import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterSetlists, filterSongs, foundInLyricsOnly, songSnippet } from '../src/search.ts';
import type { Setlist, Song } from '../src/data/types.ts';

const song = (title: string, author = ''): Song => ({
    id: title, title, author, body: '', myShift: 0, updatedAt: 1, deletedAt: null,
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
        id: title, title, eventDate: null, notes, parts: [{ id: 'a', name: 'A' }], starred: false, items: [], updatedAt: 1, deletedAt: null,
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

describe('searching the lyrics', () => {
    const withBody = (title: string, body: string, author = ''): Song => ({ ...song(title, author), body });
    const santos = [
        withBody('Santo A', '{c: Coro}\n[D]Santo, santo, santo es el [A]Señor\nDios del universo', 'Autor A'),
        withBody('Santo B', 'Hosanna en el cielo\n[G]Bendito el que viene en el nombre del Señor'),
        withBody('Pan de vida', '{sov}\n[Ebm7]Pan de vida para el camino\n{eov}'),
    ];

    it('finds a song by a word of its lyrics, ignoring chords, accents and case', () => {
        assert.deepEqual(filterSongs(santos, 'ejercitos'), []);
        assert.deepEqual(filterSongs(santos, 'CAMINO').map((s) => s.title), ['Pan de vida']);
        assert.deepEqual(filterSongs(santos, 'universo').map((s) => s.title), ['Santo A']);
    });

    it('does not read the chord names or the directives as lyrics', () => {
        assert.deepEqual(filterSongs(santos, 'Ebm7'), []);
        assert.deepEqual(filterSongs(santos, 'sov'), []);
    });

    it('accepts words from different lines of the same song', () => {
        assert.deepEqual(filterSongs(santos, 'santo universo').map((s) => s.title), ['Santo A']);
    });

    it('puts the title and author matches before the ones found only in the lyrics', () => {
        // "senor" is in the lyrics of both Santos; "Santo B" has it only there, "Santo A" too: order of arrival
        assert.deepEqual(filterSongs(santos, 'santo').map((s) => s.title), ['Santo A', 'Santo B']);
        const reversed = [santos[2] as Song, withBody('Otro', 'Dios santo y fuerte'), santos[0] as Song];
        assert.deepEqual(filterSongs(reversed, 'santo').map((s) => s.title), ['Santo A', 'Otro']);
    });
});

describe('songSnippet', () => {
    const song2: Song = { ...song('Santo A'), body: '{c: Coro}\n[D]Primera línea\nSegunda línea\nTercera línea con luz\nCuarta' };

    it('is the first two lines of the lyrics, without chords or labels', () => {
        assert.deepEqual(songSnippet(song2, ''), ['Primera línea', 'Segunda línea']);
        assert.deepEqual(songSnippet(song2, 'santo'), ['Primera línea', 'Segunda línea']);
    });

    it('starts where the search matched when the song was found through its lyrics', () => {
        assert.equal(foundInLyricsOnly(song2, 'luz'), true);
        assert.deepEqual(songSnippet(song2, 'luz'), ['Tercera línea con luz', 'Cuarta']);
    });

    it('is empty for a song with no lyrics', () => {
        assert.deepEqual(songSnippet(song('Vacío'), ''), []);
    });
});
