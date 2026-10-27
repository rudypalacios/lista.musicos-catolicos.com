/**
 * Regenerates web/test/fixtures/golden.json from the code that decides how songs are read on
 * the public site. Run it when musicos-catolicos changes how a song is parsed, rendered or
 * transposed, and commit the new file: the tests then show exactly what changed.
 *
 *     npm run fixtures -- ../musicos-catolicos
 *
 * PHP answers for ChordPro, ChordSheet, Chord and Syllable (src/Application/Song/*.php); the
 * transposition lives in public/js/song.js, so its own functions are cut out of that file and
 * run here, rather than re-implemented.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { CHORDS, SONGS, WORDS } from './corpus.ts';

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(process.argv[2] ?? '../musicos-catolicos');

const LABELS = [
    'Coro', 'Coro 2', 'Estribillo', 'Intro', 'Introducción', 'INTRODUCCIÓN', 'Interludio', 'Puente', 'Precoro',
    'Pre-coro', 'Final', 'Verso 1', 'Estrofa 2', 'Estr. 3', 'Solista', 'Todos', 'Solo de guitarra', 'Verse',
    'Chorus', 'Refrain', 'Bridge', 'Outro', 'Coda', 'Tag', 'Interlude', 'Instrumental', 'Ending', 'Stanza',
    'Prechorus', 'Coro-final', '¡Coro!', '1. Verso', 'ÚLTIMO CORO', 'coro', 'CORO', 'Ñandú', '', '  ', 'Repetir coro',
];

const corpusFile = join(mkdtempSync(join(tmpdir(), 'golden-')), 'corpus.json');
writeFileSync(corpusFile, JSON.stringify({ songs: SONGS, labels: LABELS, chords: CHORDS, words: WORDS }));
const php = JSON.parse(
    execFileSync('php', [join(here, 'golden.php'), site, corpusFile], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
) as { songs: unknown[] } & Record<string, unknown>;
rmSync(dirname(corpusFile), { recursive: true, force: true });

// song.js: the constants and the two pure functions, without the IIFE and the DOM around them
const songJs = readFileSync(join(site, 'public/js/song.js'), 'utf8');
const constants = songJs.slice(songJs.indexOf('var ENGLISH'), songJs.indexOf('var NOTATION_KEY'));
const functions = songJs.slice(songJs.indexOf('/** One note'), songJs.indexOf('function update()'));
if (!constants.includes('SEMITONE') || !functions.includes('function chordName')) {
    throw new Error('song.js changed shape: update the extraction in generate.ts');
}
const context: { state: { latin: boolean }; chordName: (chord: string, shift: number) => string } = vm.runInNewContext(
    `${constants}\nvar state = { latin: true };\n${functions}\n({ state: state, chordName: chordName })`,
);

const SHIFTS = Array.from({ length: 23 }, (_, i) => i - 11);
const transpositions = CHORDS.map((chord) => ({
    chord,
    shifts: SHIFTS,
    latin: SHIFTS.map((shift) => ((context.state.latin = true), context.chordName(chord, shift))),
    english: SHIFTS.map((shift) => ((context.state.latin = false), context.chordName(chord, shift))),
}));

const golden = { ...php, transpositions };
const out = resolve(here, '../../web/test/fixtures/golden.json');
writeFileSync(out, JSON.stringify(golden, null, 1) + '\n');
console.log(`Wrote ${out}: ${golden.songs.length} songs, ${CHORDS.length} chords, ${WORDS.length} words`);
