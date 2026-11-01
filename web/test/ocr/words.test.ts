import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importMany } from '../../src/importer.ts';
import { chordAlphabet, ocrToText, repairChord, tiltOf, type OcrWord } from '../../src/ocr/words.ts';
import type { Measure } from '../../src/pdf/layout.ts';

/** A font where every letter is as wide as half its height: a letter is 10 pixels in a line 20 high */
const measure: Measure = (_char, size) => size * 0.5;

const HEIGHT = 20;
const CHAR = 10;

let line = 0;
/** A word in the picture: `column` counts letters from x = 100, `top` is the y of its upper edge */
function word(text: string, column: number, top: number, options: { line?: number; confidence?: number; slope?: number | null } = {}): OcrWord {
    const x0 = 100 + column * CHAR;

    return {
        text,
        confidence: options.confidence ?? 95,
        line: options.line ?? 0,
        box: { x0, y0: top, x1: x0 + text.length * CHAR, y1: top + HEIGHT },
        slope: options.slope ?? 0,
    };
}

/** The words of a line of lyrics, set one letter wide apart; every word of the line has the same line number */
function lyricLine(text: string, top: number, startColumn = 0, slope = 0): OcrWord[] {
    line += 1;
    let column = startColumn;

    return text.split(' ').map((piece) => {
        const placed = word(piece, column, top, { line, slope });
        column += piece.length + 1;

        return placed;
    });
}

/** What the importer makes of the text: the body of the song, with each chord before the letter it is over */
const bodyOf = (text: string): string => importMany(`Título\n\n${text}`)[0]?.body ?? '';

/** The picture turned `degrees` about its origin (what a photo taken a little crooked is) */
function tilted(words: readonly OcrWord[], degrees: number): OcrWord[] {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const turn = (x: number, y: number): [number, number] => [x * cos - y * sin, x * sin + y * cos];

    return words.map((original) => {
        const [x0, y0] = turn(original.box.x0, original.box.y0);
        const [x1, y1] = turn(original.box.x1, original.box.y0);
        const [x2, y2] = turn(original.box.x0, original.box.y1);
        const [x3, y3] = turn(original.box.x1, original.box.y1);
        const xs = [x0, x1, x2, x3];
        const ys = [y0, y1, y2, y3];

        return { ...original, slope: angle, box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
    });
}

describe('chordAlphabet', () => {
    it('limits the second pass to what a chord is made of', () => {
        const alphabet = chordAlphabet([word('C', 0, 0), word('Am7', 5, 0), word('Un', 9, 0)]);
        assert.ok(alphabet.includes('#') && alphabet.includes('m') && alphabet.includes('G'));
        assert.ok(!alphabet.includes('o') && !alphabet.includes('e'), 'no letters of Latin names when the sheet writes English ones');
    });

    it('adds the letters of Latin names when the sheet writes them', () => {
        const alphabet = chordAlphabet([word('Do', 0, 0), word('Lam', 5, 0), word('Sol7', 10, 0), word('Fa', 15, 0), word('C', 20, 0)]);
        for (const letter of 'DoReMiFaSolLa') {
            assert.ok(alphabet.includes(letter), letter);
        }
    });
});

describe('repairChord', () => {
    it('reads a "+" as the "#" it is', () => {
        assert.equal(repairChord(' Do+m7 '), 'Do#m7');
        assert.equal(repairChord('G'), 'G');
    });
});

describe('tiltOf', () => {
    it('is the middle of the baselines, and level when there are none', () => {
        assert.equal(tiltOf([word('a', 0, 0, { slope: 0.02 }), word('b', 2, 0, { slope: 0.03 }), word('c', 4, 0, { slope: 0.5 })]), 0.03);
        assert.equal(tiltOf([word('a', 0, 0, { slope: null })]), 0);
        assert.equal(tiltOf([]), 0);
    });
});

describe('ocrToText', () => {
    const lyrics = (): OcrWord[] => [...lyricLine('Un pueblo que espera', 100), ...lyricLine('camina cantando en la luz', 160)];
    const chords = (): OcrWord[] => [
        word('C', 3, 70), word('Am', 10, 70), word('Dm', 14, 70),
        word('G', 0, 130), word('F', 12, 130),
    ];

    it('puts every chord over the syllable it is over', () => {
        const text = ocrToText(lyrics(), chords(), measure);
        assert.equal(bodyOf(text), 'Un [C]pueblo [Am]que [Dm]espera\n[G]camina cantan[F]do en la luz');
    });

    it('gives the same text for a page photographed crooked', () => {
        const straight = ocrToText(lyrics(), chords(), measure);
        for (const degrees of [-2, 1.5, 3]) {
            const crooked = ocrToText(tilted(lyrics(), degrees), tilted(chords(), degrees), measure);
            assert.equal(bodyOf(crooked), bodyOf(straight), `${degrees} degrees`);
        }
    });

    it('takes the first pass\'s noise out of a row of chords and keeps the chords of the second', () => {
        // The first pass read a C as "[e" and a G as "G"; the second pass has both right. Neither is read twice.
        const first = [...lyrics(), word('[e', 3, 70, { line: 90, confidence: 55 }), word('G', 0, 130, { line: 91, confidence: 92 })];
        const text = ocrToText(first, chords(), measure);
        assert.doesNotMatch(text, /\[e/);
        assert.equal(bodyOf(text), 'Un [C]pueblo [Am]que [Dm]espera\n[G]camina cantan[F]do en la luz');
    });

    it('reads a lone uncertain letter above the lyrics as a C the second pass missed', () => {
        const first = [...lyrics(), word('[e', 3, 70, { line: 90, confidence: 55 })];
        const second = chords().filter((chord) => chord.text !== 'C');
        const text = ocrToText(first, second, measure);
        assert.equal(bodyOf(text), 'Un [C]pueblo [Am]que [Dm]espera\n[G]camina cantan[F]do en la luz');
    });

    it('does not make a chord of a word of lyrics', () => {
        // "Aquí" is a word; the second pass read an "A" over its first letter
        const first = lyricLine('Aquí estoy hoy', 100);
        const text = ocrToText(first, [word('A', 0, 100, { confidence: 80 })], measure);
        assert.equal(text, 'Aquí estoy hoy');
    });

    it('ignores a chord the reader is not sure of when it is only one letter', () => {
        const text = ocrToText(lyricLine('Un pueblo que espera', 100), [word('C', 3, 70, { confidence: 2 })], measure);
        assert.equal(text, 'Un pueblo que espera');
    });

    it('reads the chords with a "+" for a "#" as sharps', () => {
        const text = ocrToText(lyricLine('Un pueblo que espera', 100), [word('Do+m7', 3, 70, { confidence: 0 })], measure);
        // The importer writes chords in English notation
        assert.equal(bodyOf(text), 'Un [C#m7]pueblo que espera');
    });

    it('leaves out an address at the foot of the page and a line with nothing to read', () => {
        const text = ocrToText([...lyricLine('Un pueblo que espera', 100), ...lyricLine('www.ejemplo.art', 400), word('—;;;]', 0, 600, { line: 99 })], [], measure);
        assert.equal(text, 'Un pueblo que espera');
    });

    describe('with two columns', () => {
        // A title across the whole page, a column of four songs' lines at the left and another at the right
        const left = ['Camina el pueblo', 'con paso firme', 'hacia la luz', 'del nuevo día'];
        const right = ['Canta la tierra', 'con voz de fiesta', 'junto a su gente', 'bajo el cielo'];
        const page = (): { letters: OcrWord[]; chords: OcrWord[] } => {
            const letters = [
                ...lyricLine('Canto de la alegría compartida', 20), // the title: it crosses the gutter
                ...left.flatMap((text, index) => lyricLine(text, 100 + index * 60, 0)),
                ...right.flatMap((text, index) => lyricLine(text, 300 + index * 60, 30)),
            ];
            const found = [word('C', 7, 70), word('G', 7, 130), word('Am', 8, 310), word('F', 8, 370)];

            return { letters, chords: found };
        };

        it('reads the title, then the left column, then the right one', () => {
            const { letters, chords: found } = page();
            const text = ocrToText(letters, found, measure);
            const lines = bodyOf(text).split('\n').filter((entry) => entry !== '');
            const order = [...left, ...right].map((entry) => lines.findIndex((produced) => produced.replace(/\[[^\]]+\]/g, '').includes(entry)));
            assert.ok(order.every((index) => index >= 0), `every line is there: ${JSON.stringify(lines)}`);
            assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in the order of the columns');
            assert.ok(lines.some((produced) => produced.includes('[C]')) && lines.some((produced) => produced.includes('[Am]')));
        });

        it('does not take a column for two when a single one has a wide indent', () => {
            // One column of lines, some of them pushed to the right: no gutter, no split
            const indented = [
                ...lyricLine('Verso uno', 100), ...lyricLine('Un pueblo que camina', 160), ...lyricLine('con paso muy firme', 220),
                ...lyricLine('por todo el sendero', 280), ...lyricLine('Verso dos', 340, 12), ...lyricLine('Un pueblo que canta', 400, 12),
            ];
            const text = ocrToText(indented, [], measure);
            assert.deepEqual(text.split('\n').filter((entry) => entry !== '').map((entry) => entry.trim()),
                ['Verso uno', 'Un pueblo que camina', 'con paso muy firme', 'por todo el sendero', 'Verso dos', 'Un pueblo que canta']);
        });
    });
});
