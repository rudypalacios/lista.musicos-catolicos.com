import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse, type Segment } from '../../src/chordpro/parser.ts';
import { linesOf, piecesOf, setChordAt } from '../../src/chordpro/places.ts';

/** "text" for a piece without a chord, "[G]text" for one with it */
const shown = (text: string): string[][] => linesOf(text).map((line) => line.pieces.map((piece) => `${piece.chord === null ? '' : `[${piece.chord}]`}${piece.text}`));

describe('linesOf', () => {
    it('cuts a line of lyrics at every syllable and at every chord', () => {
        assert.deepEqual(shown('Cuán[G]to he es[D]perado'), [['Cuán', '[G]to ', 'he ', 'es', '[D]pe', 'ra', 'do']]);
    });

    it('is only the lines of lyrics: blank lines, comments and directives are not lines', () => {
        const lines = linesOf('{c: Coro}\nHola mundo\n\n# nota\n{ci: x2}\nOtra línea');

        assert.equal(lines.length, 2);
        assert.deepEqual(lines.map((line) => line.pieces.map((piece) => piece.id)), [['0:0:0', '0:2:0', '0:5:0', '0:8:0'], ['1:0:0', '1:1:0', '1:5:0', '1:7:0', '1:9:0']]);
    });

    it('names a place by line, by where it starts in the words and by the chords that share the spot', () => {
        const [line] = linesOf('[G][D]más\nuno');

        assert.deepEqual(line?.pieces.map((piece) => [piece.id, piece.chord, piece.text]), [['0:0:0', 'G', ''], ['0:0:1', 'D', 'más']]);
    });

    it('does not move a place when a chord is written on it or before it (the chords are not in the words)', () => {
        const ids = (text: string): string[] => piecesOf(text).map((piece) => piece.id);

        assert.deepEqual(ids('[G]Cuánto he esperado'), ids('Cuánto he esperado'));
        assert.deepEqual(ids('Cuánto [Am]he es[D]perado'), ids('Cuánto he esperado'));
    });

    it('keeps a chord that does not fall on the start of a syllable as a place of its own', () => {
        assert.deepEqual(shown('pru[Am]eba'), [['pru', '[Am]e', 'ba']]);
    });

    it('has the chords that end a line, and the line made only of chords', () => {
        assert.deepEqual(shown('así [G]'), [['a', 'sí ', '[G]']]);
        assert.deepEqual(shown('[C][G]'), [['[C]', '[G]']]);
    });

    it('is not fooled by a bracket with nothing in it, and keeps a note of the line apart from the words', () => {
        assert.deepEqual(shown('Hola[] mundo'), [['Ho', 'la ', 'mun', 'do']]);
        const [line] = linesOf('Aleluya {ci: bis}');

        assert.equal(line?.note, 'bis');
        assert.deepEqual(line?.pieces.map((piece) => piece.text), ['A', 'le', 'lu', 'ya']);
    });

    it('marks as places the starts of syllables and the chords, and not the spaces', () => {
        const [line] = linesOf('  hola');

        assert.deepEqual(line?.pieces.map((piece) => [piece.text, piece.place]), [['  ', false], ['ho', true], ['la', true]]);
    });

    it('is a line of lyrics exactly when the parser says so, and reads the same chords and words as it', () => {
        const text = [
            '{title: x}', '{c: Verso 1}', '[G]Cuán[D]to he es[Em]perado {ci: bis}', '', '{soc}', '  [C]Coro [G/B]a[Am7]quí [F#m7]',
            '# comentario', '[C][G]', '{ci: Intro}', 'sin acordes', '[]', '[ ]vacío[ ]', '{eoc}', 'Último [Do]verso [Sol#m7]ya',
        ].join('\n');
        const parsed = parse(text).sections.flatMap((section) => section.lines).filter((line): line is Segment[] => Array.isArray(line));
        const lines = linesOf(text);

        assert.equal(lines.length, parsed.length);
        lines.forEach((line, index) => {
            const segments = parsed[index] ?? [];
            // The same words, the same chords in the same order, and each chord in front of the same words
            assert.equal(line.pieces.map((piece) => piece.text).join(''), segments.map((segment) => segment.text).join(''));
            assert.deepEqual(line.pieces.flatMap((piece) => (piece.chord === null ? [] : [piece.chord])), segments.flatMap((segment) => (segment.chord === null ? [] : [segment.chord])));
            segments.forEach((segment) => {
                if (segment.chord !== null) {
                    const at = line.pieces.findIndex((piece, position) => piece.chord === segment.chord && line.pieces.slice(position).map((p) => p.text).join('').startsWith(segment.text));
                    assert.notEqual(at, -1, `${segment.chord} before ${segment.text}`);
                }
            });
        });
    });
});

describe('setChordAt', () => {
    const text = 'Cuán[G]to he es[D]perado';

    it('writes a chord in front of the syllable', () => {
        assert.equal(setChordAt(text, '0:0:0', 'Am'), '[Am]Cuán[G]to he es[D]perado');
        assert.equal(setChordAt(text, '0:7:0', 'F'), 'Cuán[G]to [F]he es[D]perado');
    });

    it('changes the chord a place already has, and takes it out', () => {
        assert.equal(setChordAt(text, '0:4:0', 'F#m7'), 'Cuán[F#m7]to he es[D]perado');
        assert.equal(setChordAt(text, '0:4:0', null), 'Cuánto he es[D]perado');
    });

    it('takes out a chord that had nothing sung from it, and only that one', () => {
        assert.equal(setChordAt('[G][D]más', '0:0:0', null), '[D]más');
        assert.equal(setChordAt('[G][D]más', '0:0:1', null), '[G]más');
    });

    it('changes nothing when there is no such place, when there is nothing to take out, or when the chord is already that one', () => {
        assert.equal(setChordAt(text, '9:0:0', 'C'), null);
        assert.equal(setChordAt(text, '0:0:0', null), null);
        assert.equal(setChordAt(text, '0:4:0', 'G'), null);
    });

    it('works on any line, whatever comes before it, and keeps the rest of the text', () => {
        const song = '{c: Coro}\r\nuno\r\n\r\n# no\r\ndos tres';

        assert.equal(setChordAt(song, '1:4:0', 'C'), '{c: Coro}\r\nuno\r\n\r\n# no\r\ndos [C]tres');
    });

    it('keeps a note at the end of the line', () => {
        assert.equal(setChordAt('Aleluya {ci: bis}', '0:1:0', 'G'), 'A[G]leluya {ci: bis}');
    });
});
