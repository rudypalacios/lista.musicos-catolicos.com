import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { editSheet } from '../../src/chordpro/edit-sheet.ts';

const SONGS = [
    '',
    'Solo letra sin acordes\nSegunda línea',
    '{c: Verso 1}\n[G]Cuán[D]to he es[Em]perado {ci: bis}\n\n{soc}\n  [C]Coro [G/B]a[Am7]quí [F#m7]\n{eoc}',
    '{ci: Intro}\n[C][G]\n\n{c: Puente}\nasí [G]\n[G][D]más\n[]\n# no\n{chorus}',
    'Línea con acentos: corazón, señor, Dios.\n[Do]Quédate [Sol#m7]conmigo',
];

describe('editSheet', () => {
    it('draws one piece of the sheet (.seg) for every piece of the text, in the same order', () => {
        for (const song of SONGS) {
            const { html, pieces } = editSheet(song);

            assert.equal(html.split('<span class="seg">').length - 1, pieces.length, song);
        }
    });

    it('gives every syllable a slot for its chord, empty where it has none, so a plain line can be touched', () => {
        const { html } = editSheet('Hola mundo');

        assert.equal(html.split('data-chord=""').length - 1, 4);
        assert.ok(!html.includes('line--plain'));
    });

    it('draws the chords the text has, in the same place the reader draws them', () => {
        const { html } = editSheet('Cuán[G]to');

        assert.ok(html.includes('<span class="ch" data-chord="G">Sol</span>'));
    });

    it('keeps the note of a line, and the labels of the sections', () => {
        const { html } = editSheet('{c: Coro}\nHola {ci: bis}');

        assert.ok(html.includes('song-section__label'));
        assert.ok(html.includes('<span class="line__note">bis</span>'));
    });
});
