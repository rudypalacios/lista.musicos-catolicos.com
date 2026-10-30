import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Song } from '../../src/data/types.ts';
import { planSheet } from '../../src/print/plan.ts';

const song = (body: string, author = 'Autor'): Song => ({
    id: 'a', title: 'Pan de vida', author, body, myShift: 0, updatedAt: 1, deletedAt: null,
});

describe('planSheet', () => {
    const body = '{key: C}\n{capo: 2}\n{tempo: 72}\n{time: 4/4}\n[C]Pan de vida\n[G]para el camino';

    it('puts the key in the key it prints, in the notation asked for', () => {
        const latin = planSheet(song(body), { version: 'chords', shift: 2, notation: 'latin' });
        assert.deepEqual(latin.note[0], { label: 'Tono', value: 'Re' });
        const english = planSheet(song(body), { version: 'chords', shift: 2, notation: 'english' });
        assert.deepEqual(english.note[0], { label: 'Tono', value: 'D' });
    });

    it('lists capo, time and tempo as the public site does ("72" is "72 BPM", a word keeps its label)', () => {
        const plan = planSheet(song(body), { version: 'chords', shift: 0, notation: 'latin' });
        assert.deepEqual(plan.note.slice(1), [
            { label: 'Capo', value: '2' },
            { label: 'Compás', value: '4/4' },
            { label: '', value: '72 BPM' },
        ]);
        const worded = planSheet(song('{tempo: Lento}\n[C]Uno'), { version: 'chords', shift: 0, notation: 'latin' });
        assert.deepEqual(worded.note.at(-1), { label: 'Tempo', value: 'Lento' });
    });

    it('prints no musical data on the sheet to hand out', () => {
        assert.deepEqual(planSheet(song(body), { version: 'lyrics', shift: 0, notation: 'latin' }).note, []);
    });

    it('prints a song without chords as lyrics, whatever was asked', () => {
        const plan = planSheet(song('Solo letra\nOtra línea'), { version: 'chords', shift: 0, notation: 'latin' });
        assert.equal(plan.version, 'lyrics');
        assert.deepEqual(plan.note, []);
    });

    it('joins the author and the part of the Mass, and measures that same text', () => {
        const plan = planSheet(song(body), { version: 'chords', shift: 0, notation: 'latin', part: 'Ofertorio' });
        assert.equal(plan.subtitle, 'Autor · Ofertorio');
        assert.equal(planSheet(song(body, ''), { version: 'chords', shift: 0, notation: 'latin' }).subtitle, '');
        assert.equal(planSheet(song(body, ''), { version: 'chords', shift: 0, notation: 'latin', part: 'Paz' }).subtitle, 'Paz');
    });

    it('lets a long header push a song that just fits to a tighter layout', () => {
        const stanzas = Array(4).fill(Array(4).fill('[G]Cuánto he espe[D]rado este mo[Em]mento').join('\n')).join('\n\n')
            + Array(4).fill('\n[C]Otra línea').join('');
        const short = planSheet({ ...song(stanzas), title: 'Corto' }, { version: 'chords', shift: 0, notation: 'latin' });
        const long = planSheet({ ...song(stanzas), title: 'Un título muy largo '.repeat(3), author: 'Artista · Disco' }, { version: 'chords', shift: 0, notation: 'latin' });
        assert.equal(short.layout, 'normal');
        assert.equal(long.layout, 'compact');
    });
});
