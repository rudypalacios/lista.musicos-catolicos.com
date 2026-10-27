import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { importChordsOverLyrics, importMany } from '../../src/importer.ts';
import { pageToText, pagesToText, syllableStarts, type Measure, type TextItem } from '../../src/pdf/layout.ts';

/** Letters of a proportional font: narrow ones, wide ones, the rest (ratios are all that count) */
const measure: Measure = (char, size) => {
    const ratio = 'ilj.,;:!\'| '.includes(char) ? 0.3 : 'mwMW'.includes(char) ? 0.85 : 'ftr1I'.includes(char) ? 0.4 : 0.55;

    return ratio * size;
};

const SIZE = 15;
const LINE = 18.3;

/** Width of a text in the test font, times `scale` (a font a bit wider or narrower than the one measured) */
const widthOf = (text: string, scale = 1): number => [...text].reduce((sum, char) => sum + measure(char, SIZE), 0) * scale;

/** x of the left edge of letter `index` of `text` set at `x` */
const xOf = (text: string, index: number, x: number, scale = 1): number => x + widthOf(text.slice(0, index), scale);

const item = (str: string, x: number, y: number, scale = 1): TextItem => ({
    str, x, y, width: widthOf(str, scale), height: SIZE,
});

/** A chord line and the lyric line under it, with each chord over the letter of `lyric` it is told */
function stanza(top: number, lyric: string, chords: [string, number][], x = 54, scale = 1): TextItem[] {
    return [
        ...chords.map(([chord, index]) => item(chord, xOf(lyric, index, x, scale), top)),
        item(lyric, x, top - LINE, scale),
    ];
}

describe('pageToText', () => {
    it('puts each chord at the syllable of the lyric it is over', () => {
        const lyric = 'Caminamos con alegría, Señor,';
        const text = pageToText(stanza(700, lyric, [['C', 0], ['G', 10], ['Am', 18]]), measure);

        const imported = importChordsOverLyrics(text);

        assert.equal(imported.body, '[C]Caminamos [G]con ale[Am]gría, Señor,');
    });

    it('is exact however wide the PDF font is compared with the one measuring it', () => {
        const lyric = 'Un pueblo que espera el mañana,';
        for (const scale of [0.8, 1, 1.25]) {
            const text = pageToText(stanza(700, lyric, [['F', 3], ['G', 11], ['C', 20]], 54, scale), measure);

            assert.equal(importChordsOverLyrics(text).body, 'Un [F]pueblo [G]que espera [C]el mañana,', `scale ${scale}`);
        }
    });

    it('snaps a chord that sits inside a syllable to where the syllable starts', () => {
        // The chord is over the "r" of "bran": typed by eye, it was meant for the "b"
        const lyric = 'sembrando tu paz';

        const imported = importChordsOverLyrics(pageToText(stanza(700, lyric, [['Dm', 4]]), measure));

        assert.equal(imported.body, 'sem[Dm]brando tu paz');
    });

    it('snaps to the start of a word as well, and to a syllable of the next word if that is nearer', () => {
        const lyric = 'Un pueblo que espera';
        // Over the space between "pueblo" and "que": the nearest start is the one of "que"
        const imported = importChordsOverLyrics(pageToText(stanza(700, lyric, [['Am', 9]]), measure));

        assert.equal(imported.body, 'Un pueblo [Am]que espera');
    });

    it('keeps the order of chords and never stacks two on one letter', () => {
        // Dm is wider than the letter it is over, so the next chords start before it ends
        const lyric = 'Gloria a Dios';
        const text = pageToText(stanza(700, lyric, [['Dm', 0], ['C', 2], ['Bb', 3]]), measure);

        const line = text.split('\n')[0] ?? '';
        assert.deepEqual(line.trim().split(/\s+/), ['Dm', 'C', 'Bb']);
        const body = importChordsOverLyrics(text).body;
        assert.match(body, /\[Dm\].*\[C\].*\[Bb\]/);
        assert.equal(body.replace(/\[[^\]]*\]/g, ''), lyric, 'no letter lost');
    });

    it('puts chords after the last word where they were', () => {
        const lyric = 'Así vamos';
        const items = [...stanza(700, lyric, [['C', 0]]), item('Em', xOf(lyric, 9, 54) + 40, 700)];

        const imported = importChordsOverLyrics(pageToText(items, measure));

        assert.equal(imported.body, '[C]Así vamos[Em]');
    });

    it('reads chords written as one text run with spaces between them', () => {
        const lyric = 'Los que caminan por la vida Señor,';
        const items = [item('F          G      Em', 54, 700), item(lyric, 54, 700 - LINE)];

        const imported = importChordsOverLyrics(pageToText(items, measure));

        assert.match(imported.body, /^\[F\]Los .*\[G\].*\[Em\]/);
    });

    it('separates stanzas by the vertical gap, and keeps lines of a stanza together', () => {
        const items = [
            ...stanza(700, 'Primera línea', [['C', 0]]),
            ...stanza(700 - 2 * LINE, 'Segunda línea', [['G', 0]]),
            ...stanza(700 - 4 * LINE - LINE, 'Tercera línea', [['Am', 0]]),
        ];

        assert.equal(importChordsOverLyrics(pageToText(items, measure)).body, '[C]Primera línea\n[G]Segunda línea\n\n[Am]Tercera línea');
    });

    it('keeps a verse number in the margin out of the way', () => {
        const lyric = 'Un pueblo que espera';
        const items = [
            item('1.', 36, 700 - LINE),
            ...stanza(700, lyric, [['C', 0], ['Am', 9]], 54),
            ...stanza(700 - 2 * LINE, 'y sabe que Dios está aquí.', [['G', 5]], 54),
        ];

        const imported = importChordsOverLyrics(pageToText(items, measure));

        assert.match(imported.body, /^\{c: Verso 1\}\n\[C\]Un pueblo \[Am\]que espera\n/);
        assert.match(imported.body, /y sa\[G\]be que Dios/);
    });

    it('gives chords with no lyric under them as a line of their own', () => {
        const items = [
            item('G', 54, 700), item('D', 120, 700), item('Em', 200, 700),
            ...stanza(700 - 3 * LINE, 'Letra', [['C', 0]]),
            ...stanza(700 - 5 * LINE, 'Más letra', [['G', 0]]),
        ];

        const imported = importChordsOverLyrics(pageToText(items, measure));

        assert.match(imported.body, /^\[G\] \[D\] \[Em\]\n\n\[C\]Letra\n\[G\]Más letra/);
    });

    it('reads a page in two columns, the left one and then the right one', () => {
        const left = ['Cantamos al amanecer', 'con la luz de un día', 'Cantamos a mediodía', 'con el sol sobre el campo'];
        const right = ['Cantamos al caer la tarde', 'con la paz de nuestro hogar', 'Cantamos en la noche', 'con la fe de nuestra gente'];
        const items: TextItem[] = [];
        left.forEach((line, i) => items.push(...stanza(700 - i * 2 * LINE, line, [[i % 2 === 0 ? 'C' : 'G', 0]], 54)));
        right.forEach((line, i) => items.push(...stanza(700 - i * 2 * LINE, line, [[i % 2 === 0 ? 'Am' : 'F', 0]], 340)));

        const text = pageToText(items, measure);
        const imported = importChordsOverLyrics(text);

        assert.ok(text.indexOf('Cantamos al amanecer') < text.indexOf('con el sol sobre el campo'));
        assert.ok(text.indexOf('con el sol sobre el campo') < text.indexOf('Cantamos al caer la tarde'), text);
        assert.match(imported.body, /\[C\]Cantamos al amanecer/);
        assert.match(imported.body, /\[Am\]Cantamos al caer la tarde/);
        assert.match(imported.body, /\[F\]con la paz de nuestro hogar/);
    });

    it('does not take one column with a title above it for two', () => {
        const items = [item('ENTRADA: Un canto', 54, 760), ...stanza(700, 'Una línea de letra bastante larga para la página', [['C', 0], ['G', 30]])];

        assert.equal(pageToText(items, measure).split('\n\n').length, 1);
    });

    it('is empty for an empty page and ignores blank items', () => {
        assert.equal(pageToText([], measure), '');
        assert.equal(pageToText([item('   ', 54, 700), { ...item('', 54, 680), width: 0 }], measure), '');
    });
});

describe('a whole Mass, one song per page', () => {
    const song = (header: string, chord: string, words: string): string =>
        pageToText([item(header, 54, 740), ...stanza(700, words, [[chord, 0]])], measure);

    it('becomes one song per page for importMany', () => {
        const text = pagesToText([
            song('ENTRADA: Canto de apertura', 'C', 'Abrimos la puerta de casa'),
            song('GLORIA', 'Dm', 'Gloria a Dios en el cielo'),
            song('SALIDA: Canto de despedida', 'G', 'Vamos en paz a servir'),
        ]);

        const songs = importMany(text);

        assert.deepEqual(songs.map((s) => s.title), ['Canto de apertura', 'Gloria', 'Canto de despedida']);
        assert.deepEqual(songs.map((s) => s.part), ['entrada', 'gloria', 'salida']);
        assert.equal(songs[1]?.body, '[Dm]Gloria a Dios en el cielo');
    });
});

describe('syllableStarts', () => {
    it('lists the start of each syllable of each word', () => {
        assert.deepEqual(syllableStarts('sembrando tu paz'), [0, 3, 7, 10, 13]);
        assert.deepEqual(syllableStarts('Caminamos con'), [0, 2, 4, 6, 10]);
    });

    it('includes numbers and brackets, which no syllable rule covers', () => {
        assert.deepEqual(syllableStarts('1. Un (BIS)'), [0, 3, 6, 7]);
    });

    it('is empty for an empty line', () => {
        assert.deepEqual(syllableStarts('   '), []);
    });
});
