import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chordsAboveRows, chordsAboveText, type CopiedBlock } from '../src/copy-sheet.ts';
import { convertPastedSheet } from '../src/importer.ts';

const line = (...pieces: [string | null, string][]) => ({ segments: pieces.map(([chord, text]) => ({ chord, text })) });

describe('chordsAboveRows', () => {
    it('puts each chord over the first letter of the words it was sung with', () => {
        const rows = chordsAboveRows(line(['Re', 'Ya no eres '], ['Sol', 'pan y '], ['Re', 'vino,']));

        assert.deepEqual(rows, { chords: 'Re         Sol   Re', words: 'Ya no eres pan y vino,' });
        assert.equal(rows.chords.indexOf('Sol'), rows.words.indexOf('pan'));
    });

    it('lets a chord stand in the middle of a word', () => {
        const rows = chordsAboveRows(line([null, 'de ro'], ['Sol', 'dillas yo caigo']));

        assert.deepEqual(rows, { chords: '     Sol', words: 'de rodillas yo caigo' });
    });

    it('moves the words on when chords are too close, so none lands on another', () => {
        const rows = chordsAboveRows(line(['Do', 'a'], ['Sol', 'b'], ['La', 'cde']));

        assert.deepEqual(rows, { chords: 'Do Sol La', words: 'a  b   cde' });
    });

    it('keeps a chord after the last word, and the note at the end of the line', () => {
        const rows = chordsAboveRows({ segments: [{ chord: 'Re', text: 'amén ' }, { chord: 'La', text: ' ' }], note: 'x2' });

        assert.deepEqual(rows, { chords: 'Re   La', words: 'amén  x2' });
    });

    it('has no row of chords for a line without any', () => {
        assert.deepEqual(chordsAboveRows(line([null, 'Sin acordes'])), { chords: '', words: 'Sin acordes' });
    });
});

describe('chordsAboveText', () => {
    const blocks: CopiedBlock[] = [
        { label: 'Coro' },
        { line: line(['Re', 'Ya no eres '], ['Sol', 'pan']) },
        { line: line([null, 'ahora que eres cuerpo']) },
        { label: 'Verso 1' },
        { line: line(['La', ''], ['Re', '']) },
        { line: line(['Mi', 'cómo no te voy a adorar']) },
        { remark: 'x2' },
    ];

    it('writes a line of chords above each line of words, a blank line before each section, and a line of only chords by itself', () => {
        assert.equal(chordsAboveText(blocks), [
            'Coro',
            'Re         Sol',
            'Ya no eres pan',
            'ahora que eres cuerpo',
            '',
            'Verso 1',
            'La Re',
            'Mi',
            'cómo no te voy a adorar',
            'x2',
        ].join('\n'));
    });

    it('keeps the spaces at the start of the first row of chords: they are its columns', () => {
        assert.equal(chordsAboveText([{ line: line([null, 'de ro'], ['Sol', 'dillas']) }]), '     Sol\nde rodillas');
    });

    it('is a sheet the editor reads back as the same song', () => {
        const text = chordsAboveText([
            { line: line(['D', 'Ya no eres '], ['G', 'pan y '], ['D', 'vino,']) },
            { line: line([null, 'ahora que eres '], ['G', 'cuerpo y '], ['D', 'sangre, vives en '], ['A', 'mí']) },
            { line: line([null, 'de ro'], ['G', 'dillas yo caigo al contem'], ['D', 'plar tu bondad,']) },
        ]);

        assert.equal(convertPastedSheet(text)?.body, [
            '[D]Ya no eres [G]pan y [D]vino,',
            'ahora que eres [G]cuerpo y [D]sangre, vives en [A]mí',
            'de ro[G]dillas yo caigo al contem[D]plar tu bondad,',
        ].join('\n'));
    });
});
