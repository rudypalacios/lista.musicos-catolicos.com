import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deleteSongText } from '../src/views/delete-song.ts';

describe('deleteSongText', () => {
    it('only warns that it cannot be undone when the song is in no list', () => {
        assert.equal(deleteSongText([]), 'Se borra el canto de todos tus dispositivos. No se puede deshacer.');
    });

    it('names the list a song is in', () => {
        const text = deleteSongText([{ title: 'Domingo 3' }]);

        assert.match(text, /Está en el listado «Domingo 3»/);
        assert.match(text, /«Canto eliminado»/);
    });

    it('counts and names several lists', () => {
        assert.match(deleteSongText([{ title: 'A' }, { title: 'B' }]), /Está en 2 listados \(«A», «B»\)/);
    });
});
