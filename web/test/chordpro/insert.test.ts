import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { insertItem } from '../../src/chordpro/insert.ts';
import { lineRange } from '../../src/chordpro/lines.ts';

/** The result as text with the selection marked: "[" and "]" around it, "|" for a cursor */
const shown = (edit: { text: string; from: number; to: number }): string =>
    edit.from === edit.to
        ? `${edit.text.slice(0, edit.from)}|${edit.text.slice(edit.to)}`
        : `${edit.text.slice(0, edit.from)}[${edit.text.slice(edit.from, edit.to)}]${edit.text.slice(edit.to)}`;

describe('lineRange', () => {
    const text = 'uno\ndos\ntres';

    it('takes the whole lines a selection touches', () => {
        assert.deepEqual(lineRange(text, 1, 5), { start: 0, end: 7 });
        assert.deepEqual(lineRange(text, 9, 11), { start: 8, end: 12 });
    });

    it('does not take the next line when a whole line is picked with its newline', () => {
        assert.deepEqual(lineRange(text, 0, 4), { start: 0, end: 3 });
        assert.deepEqual(lineRange(text, 4, 8), { start: 4, end: 7 });
    });

    it('is the line of a cursor', () => {
        assert.deepEqual(lineRange(text, 5, 5), { start: 4, end: 7 });
    });
});

describe('insertItem at the cursor', () => {
    it('writes the label and the note on a line of their own, with the cursor inside the braces', () => {
        assert.equal(shown(insertItem('', 0, 0, 'section')), '{c: |}');
        assert.equal(shown(insertItem('Hola', 4, 4, 'note')), 'Hola\n{ci: |}');
        assert.equal(shown(insertItem('Hola\nmundo', 4, 4, 'note')), 'Hola\n{ci: |}\nmundo');
        assert.equal(shown(insertItem('Hola mundo', 5, 5, 'section')), 'Hola \n{c: |}\nmundo');
    });

    it('writes the chorus pair with the cursor on the blank line between them', () => {
        assert.equal(shown(insertItem('', 0, 0, 'chorus')), '{soc}\n|\n{eoc}');
        assert.equal(shown(insertItem('uno\n', 4, 4, 'chorus')), 'uno\n{soc}\n|\n{eoc}');
    });
});

describe('insertItem with a selection', () => {
    const text = 'Verso\nAle[G]luya\nprepa[D]rad\nfin';

    it('wraps the lines selected in the chorus, which stay selected between the two', () => {
        const from = text.indexOf('luya');
        const to = text.indexOf('rad') + 2;

        assert.equal(shown(insertItem(text, from, to, 'chorus')), 'Verso\n{soc}\n[Ale[G]luya\nprepa[D]rad]\n{eoc}\nfin');
    });

    it('wraps one whole line picked with its newline without taking the next', () => {
        assert.equal(shown(insertItem('uno\ndos\ntres', 0, 4, 'chorus')), '{soc}\n[uno]\n{eoc}\ndos\ntres');
    });

    it('turns the lines selected into the label or the note', () => {
        assert.equal(shown(insertItem('Coro\nAle[G]luya', 1, 3, 'section')), '{c: Coro}|\nAle[G]luya');
        assert.equal(shown(insertItem('uno\ndos\ntres', 0, 7, 'note')), '{ci: uno dos}|\ntres');
    });

    it('does not nest a directive that the line already is', () => {
        assert.equal(shown(insertItem('{ci: Intro}\n[C] [G]', 3, 6, 'section')), '{c: Intro}|\n[C] [G]');
    });
});

describe('insertItem above the lyrics', () => {
    it('writes the note at the top of the text, whatever the cursor, with the cursor after its colon', () => {
        assert.equal(shown(insertItem('Hola\nmundo', 7, 7, 'capo')), '{capo: |}\nHola\nmundo');
        assert.equal(shown(insertItem('', 0, 0, 'tempo')), '{tempo: |}\n');
        assert.equal(shown(insertItem('Hola', 2, 3, 'time')), '{time: |}\nHola');
    });

    it('goes to the value of the note the song already has, selected, instead of writing a second', () => {
        assert.equal(shown(insertItem('{capo: 2}\nHola', 12, 12, 'capo')), '{capo: [2]}\nHola');
        assert.equal(shown(insertItem('{key: G}\n{tempo:   72 }\nHola', 0, 0, 'tempo')), '{key: G}\n{tempo:   [72 ]}\nHola');
        assert.equal(shown(insertItem('{capo: }\nHola', 0, 0, 'capo')), '{capo: |}\nHola');
    });
});
