/**
 * The port against the code it ports. golden.json holds what ChordPro, ChordSheet, Chord and
 * Syllable (PHP) and song.js (browser) of musicos-catolicos answered for the same inputs
 * (scripts/fixtures). Any difference here is the app reading a song differently from the
 * public site.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { english, key as chordKey, latin, transpose } from '../../src/chordpro/chord.ts';
import { isVerseLabel, kindOf, parse, songKey, type Sheet } from '../../src/chordpro/parser.ts';
import { sheetHtml } from '../../src/chordpro/sheet.ts';
import { firstLength } from '../../src/chordpro/syllable.ts';

interface Golden {
    songs: { name: string; input: string; sheet: Sheet; html: string; key: string | null }[];
    labels: { label: string; kind: string; isVerseLabel: boolean }[];
    chords: { input: string; english: string; latin: string; key: string | null }[];
    words: { word: string; length: number }[];
    transpositions: { chord: string; shifts: number[]; latin: string[]; english: string[] }[];
}

/**
 * The one place the app differs from the site on purpose (the owner, 2026-11-08): Cb, Db, Fb, Gb and Ab are shown as
 * B, C#, E, F# and G# (Si, Do#, Mi, Fa#, Sol#), as a root or as a bass. Everything else must stay the site's.
 */
const SPELLED: Readonly<Record<string, string>> = {
    Cb: 'B', Db: 'C#', Fb: 'E', Gb: 'F#', Ab: 'G#', Dob: 'Si', Reb: 'Do#', Fab: 'Mi', Solb: 'Fa#', Lab: 'Sol#',
};
const appSpelling = (name: string): string => name.replace(/(^|[/(])(Cb|Db|Fb|Gb|Ab|Dob|Reb|Fab|Solb|Lab)/g, (_all, lead: string, note: string) => lead + (SPELLED[note] ?? note));

/** What is not a stored (English) chord, like a chord typed in Latin, comes back from `transpose` untouched */
const spelled = (chord: string, expected: string): string => (/^\(?\s*[A-G]/.test(chord) ? appSpelling(expected) : expected);

const golden = JSON.parse(
    readFileSync(new URL('../fixtures/golden.json', import.meta.url), 'utf8'),
) as Golden;

describe('golden fixtures: songs', () => {
    for (const song of golden.songs) {
        it(`parses "${song.name}" as ChordPro.php does`, () => {
            assert.deepEqual(parse(song.input), song.sheet);
        });

        it(`renders "${song.name}" as ChordSheet.php does`, () => {
            assert.equal(sheetHtml(parse(song.input)), song.html);
        });

        it(`finds the key of "${song.name}" as ChordPro::key does`, () => {
            assert.equal(songKey(parse(song.input)), song.key);
        });
    }
});

describe('golden fixtures: labels', () => {
    for (const { label, kind, isVerseLabel: numbersAVerse } of golden.labels) {
        it(`classifies the label ${JSON.stringify(label)}`, () => {
            assert.equal(kindOf(label), kind);
            assert.equal(isVerseLabel(label), numbersAVerse);
        });
    }
});

describe('golden fixtures: chords', () => {
    for (const row of golden.chords) {
        it(`names ${JSON.stringify(row.input)} as Chord.php does`, () => {
            assert.equal(english(row.input), row.english);
            assert.equal(latin(row.input), row.latin);
            assert.equal(chordKey(row.input), row.key);
        });
    }

    for (const row of golden.transpositions) {
        it(`transposes ${JSON.stringify(row.chord)} as song.js does`, () => {
            row.shifts.forEach((shift, index) => {
                assert.equal(transpose(row.chord, shift, 'latin'), spelled(row.chord, row.latin[index] ?? ''), `latin, ${shift}`);
                assert.equal(transpose(row.chord, shift, 'english'), spelled(row.chord, row.english[index] ?? ''), `english, ${shift}`);
            });
        });
    }
});

describe('the app spells Cb Db Fb Gb Ab as B C# E F# G#', () => {
    it('as a root or a bass, in both notations, with the quality kept', () => {
        assert.equal(transpose('Db', 0, 'english'), 'C#');
        assert.equal(transpose('Db', 0, 'latin'), 'Do#');
        assert.equal(transpose('Gbm7', 0, 'latin'), 'Fa#m7');
        assert.equal(transpose('Cb', 0, 'english'), 'B');
        assert.equal(transpose('Fb/Cb', 0, 'latin'), 'Mi/Si');
        assert.equal(transpose('Abm7', 0, 'latin'), 'Sol#m7');
        assert.equal(transpose('C/Ab', 0, 'english'), 'C/G#');
        assert.equal(transpose('(Gb)', 0, 'english'), '(F#)');
    });

    it('leaves Eb and Bb as they are, and transposing spells C# Eb F# G# Bb', () => {
        for (const flat of ['Eb', 'Bb']) {
            assert.equal(transpose(flat, 0, 'english'), flat);
        }
        assert.deepEqual([1, 3, 6, 8, 10].map((shift) => transpose('C', shift, 'english')), ['C#', 'Eb', 'F#', 'G#', 'Bb']);
        assert.equal(transpose('F', 3, 'latin'), 'Sol#');
    });
});

describe('golden fixtures: syllables', () => {
    for (const { word, length } of golden.words) {
        it(`splits the first syllable of ${JSON.stringify(word)}`, () => {
            assert.equal(firstLength(word), length);
        });
    }
});

describe('the corpus covers what it claims', () => {
    it('has both kinds of chord and every section kind', () => {
        const kinds = new Set(golden.songs.flatMap((song) => song.sheet.sections.map((section) => section.kind)));
        assert.deepEqual([...kinds].sort(), ['chorus', 'other', 'verse']);
        assert.ok(golden.songs.some((song) => song.sheet.hasChords));
        assert.ok(golden.songs.some((song) => !song.sheet.hasChords));
    });
});
