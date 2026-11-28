import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Setlist, Song } from '../src/data/types.ts';
import { fileNameOf, hasLibrary, libraryFiles, listsText, songText } from '../src/export.ts';

const song = (id: string, title: string, body: string, author = ''): Song => ({
    id, title, author, body, tags: [], myShift: 0, status: 'published', listenUrl: '', updatedAt: 1, deletedAt: null,
});

const list = (title: string, items: Setlist['items'], parts: Setlist['parts']): Setlist => ({
    id: 'l1', title, eventDate: null, notes: '', starred: false, items, parts, updatedAt: 1, deletedAt: null,
});

describe('the file name of a song', () => {
    it('drops what a file system does not accept and what only confuses', () => {
        assert.equal(fileNameOf('Aleluya / Cantad'), 'Aleluya Cantad');
        assert.equal(fileNameOf('¿Quién es? "Él": *ese*'), '¿Quién es Él ese');
        assert.equal(fileNameOf('../../etc/passwd'), 'etc passwd');
        assert.equal(fileNameOf('  ...Salmo 22...  '), 'Salmo 22');
    });

    it('is never empty and never very long', () => {
        assert.equal(fileNameOf(''), 'Canto sin título');
        assert.equal(fileNameOf('///'), 'Canto sin título');
        assert.ok(fileNameOf('a'.repeat(300)).length <= 80);
    });
});

describe('the text of a song', () => {
    it('is ChordPro: its title and author as directives, then the text as written', () => {
        assert.equal(songText(song('1', 'Aleluya', '[C]Cantad al [G]Señor\n\n', 'Anónimo')), '{title: Aleluya}\n{artist: Anónimo}\n\n[C]Cantad al [G]Señor\n');
    });

    it('leaves the author out when there is none', () => {
        assert.equal(songText(song('1', 'Aleluya', '[C]Hola')), '{title: Aleluya}\n\n[C]Hola\n');
    });
});

describe('the lists', () => {
    const songs = [song('a', 'Entrada de prueba', '[D]Venid'), song('b', 'Sin acordes', 'Solo letra')];
    const parts = [{ id: 'entrada', name: 'Entrada' }, { id: 'salida', name: 'Salida' }, { id: 'oculta', name: 'Oculta', off: true as const }];
    const item = (id: string, part: string, songId: string, transposeBy: number, note = '') => ({ id, part, songId, transpose: transposeBy, note });

    it('are written in the order of the Mass, each song in the key it has there, in Latin or in English', () => {
        const text = listsText(songs, [list('Misa del domingo', [item('i1', 'salida', 'b', 0), item('i2', 'entrada', 'a', 2, 'sin el último coro')], parts)], 'latin');

        assert.equal(text, 'Misa del domingo\n================\n\nEntrada\n  1. Entrada de prueba — Mi (sin el último coro)\n\nSalida\n  1. Sin acordes\n');
        assert.match(listsText(songs, [list('Misa', [item('i2', 'entrada', 'a', 2)], parts)], 'english'), /Entrada de prueba — E\n/);
    });

    it('say only the change for a song with no key, and a deleted song says so', () => {
        const text = listsText(songs, [list('Misa', [item('i1', 'entrada', 'b', -2), item('i2', 'entrada', 'zzz', 0)], parts)], 'latin');

        assert.match(text, /1\. Sin acordes — -2\n/);
        assert.match(text, /2\. Canto eliminado\n/);
    });

    it('leave out the sections that are off or empty', () => {
        const text = listsText(songs, [list('Misa', [item('i1', 'entrada', 'a', 0)], parts)], 'latin');

        assert.ok(!text.includes('Salida') && !text.includes('Oculta'));
    });
});

describe('the files of the copy', () => {
    it('are one per song under cantos/, and a listados.txt only when there are lists', () => {
        const songs = [song('a', 'Aleluya', '[C]x'), song('b', 'Aleluya', '[D]y'), song('c', 'aleluya', 'z')];

        assert.deepEqual(libraryFiles(songs, [], 'latin').map((file) => file.name), ['cantos/Aleluya.txt', 'cantos/Aleluya (2).txt', 'cantos/aleluya (3).txt']);
        const withList = libraryFiles(songs, [list('Misa', [], [])], 'latin');
        assert.equal(withList.at(-1)?.name, 'listados.txt');
    });

    it('has nothing to take when there is nothing', () => {
        assert.equal(hasLibrary([], []), false);
        assert.equal(hasLibrary([song('a', 'A', '')], []), true);
        assert.equal(hasLibrary([], [list('Misa', [], [])]), true);
    });
});
