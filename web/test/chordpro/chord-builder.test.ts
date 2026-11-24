import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as chordBuilder from '../../src/chordpro/chord-builder.ts';

const made = (build: (builder: chordBuilder.Builder) => chordBuilder.Builder): string => chordBuilder.nameOf(build(chordBuilder.blank()));

describe('nameOf', () => {
    it('has no name until it has a note', () => {
        assert.equal(chordBuilder.nameOf(chordBuilder.blank()), '');
        assert.equal(made((b) => chordBuilder.toggleTerm(b, 'm')), '');
    });

    it('puts the pieces together as a chord is written', () => {
        assert.equal(made((b) => chordBuilder.setRoot(b, 'D')), 'D');
        assert.equal(made((b) => chordBuilder.toggleTerm(chordBuilder.setRoot(b, 'D'), 'm')), 'Dm');
        assert.equal(made((b) => chordBuilder.toggleNumber(chordBuilder.toggleTerm(chordBuilder.setRoot(b, 'A'), 'm'), '7')), 'Am7');
        assert.equal(made((b) => chordBuilder.toggleTerm(chordBuilder.toggleNumber(chordBuilder.setRoot(b, 'G'), '7'), 'sus4')), 'G7sus4');
        assert.equal(made((b) => chordBuilder.toggleTerm(chordBuilder.setRoot(b, 'C'), 'add9')), 'Cadd9');
        assert.equal(made((b) => chordBuilder.toggleTerm(chordBuilder.toggleNumber(chordBuilder.setRoot(b, 'C'), '9'), 'maj')), 'Cmaj9');
    });

    it('reads a major without a number as a major seventh', () => {
        assert.equal(made((b) => chordBuilder.toggleTerm(chordBuilder.setRoot(b, 'C'), 'maj')), 'Cmaj7');
        assert.equal(made((b) => chordBuilder.toggleTerm(chordBuilder.toggleNumber(chordBuilder.setRoot(b, 'C'), '6'), 'maj')), 'Cmaj7');
    });

    it('writes the black keys the way the app spells them, whichever way they are reached', () => {
        const root = (note: chordBuilder.Note, accidental: 1 | -1): string => made((b) => chordBuilder.toggleAccidental(chordBuilder.setRoot(b, note), accidental));

        assert.deepEqual(
            [root('C', 1), root('D', -1), root('D', 1), root('E', -1), root('F', 1), root('G', -1), root('G', 1), root('A', -1), root('A', 1), root('B', -1), root('B', 1), root('E', 1), root('C', -1), root('F', -1)],
            ['C#', 'C#', 'D#', 'D#', 'F#', 'F#', 'G#', 'G#', 'Bb', 'Bb', 'C', 'F', 'B', 'E'],
        );
    });

    it('adds the bass note, with its own sharp or flat, only once it has a note', () => {
        const base = chordBuilder.toggleBass(chordBuilder.setRoot(chordBuilder.blank(), 'D'));

        assert.equal(chordBuilder.nameOf(base), 'D');
        assert.equal(chordBuilder.nameOf(chordBuilder.toggleBassAccidental(chordBuilder.setBassRoot(base, 'F'), 1)), 'D/F#');
        assert.equal(chordBuilder.nameOf(chordBuilder.setBassRoot(chordBuilder.setBassRoot(base, 'F'), 'F')), 'D');
        assert.equal(chordBuilder.nameOf(chordBuilder.toggleBass(base)), 'D');
    });

    it('takes a sharp or a flat away by touching it again, and a number too', () => {
        const sharp = chordBuilder.toggleAccidental(chordBuilder.setRoot(chordBuilder.blank(), 'F'), 1);

        assert.equal(chordBuilder.nameOf(chordBuilder.toggleAccidental(sharp, 1)), 'F');
        assert.equal(chordBuilder.nameOf(chordBuilder.toggleNumber(chordBuilder.toggleNumber(sharp, '7'), '7')), 'F#');
    });

    it('keeps one of the terms that rule each other out', () => {
        const rooted = chordBuilder.setRoot(chordBuilder.blank(), 'E');

        assert.equal(chordBuilder.nameOf(chordBuilder.toggleTerm(chordBuilder.toggleTerm(rooted, 'm'), 'dim')), 'Edim');
        assert.equal(chordBuilder.nameOf(chordBuilder.toggleTerm(chordBuilder.toggleTerm(rooted, 'sus2'), 'sus4')), 'Esus4');
        assert.equal(chordBuilder.nameOf(chordBuilder.toggleTerm(chordBuilder.toggleTerm(rooted, 'm'), 'maj')), 'Emmaj7');
    });

    it('writes "otro" last and lets nothing in that could break a bracket', () => {
        const rooted = chordBuilder.toggleNumber(chordBuilder.setRoot(chordBuilder.blank(), 'B'), '7');

        assert.equal(chordBuilder.nameOf(chordBuilder.setExtra(rooted, '(b5)')), 'B7(b5)');
        assert.equal(chordBuilder.nameOf(chordBuilder.setExtra(rooted, ' [b5] ')), 'B7b5');
    });
});

describe('readChord', () => {
    const names = [
        'C', 'Am', 'F#m7', 'Bb', 'D7sus4', 'Cmaj7', 'Cmaj9', 'Em7/D', 'Fadd9', 'C6', 'Cdim', 'Gaug', 'Dsus2', 'Bm7(b5)', 'C6/9', 'Emmaj7',
        'Cmaj', 'Cadd11', 'G7/B', 'A/C#', 'Csus2add9', 'C11', 'C13', 'C5', 'Dm9',
    ];

    it('gives back the same name for the chords a builder can make, and for what it cannot make as typed', () => {
        for (const name of names) {
            assert.equal(chordBuilder.nameOf(chordBuilder.readChord(name)), name, name);
        }
    });

    it('splits a chord into its pieces', () => {
        assert.deepEqual(chordBuilder.readChord('F#m7/C#'), { root: 'F', accidental: 1, number: '7', terms: ['m'], extra: '', bass: { root: 'C', accidental: 1 } });
        assert.deepEqual(chordBuilder.readChord('D7sus4'), { root: 'D', accidental: 0, number: '7', terms: ['sus4'], extra: '', bass: null });
    });

    it('gives a blank builder for what is not a chord (N.C., a chord in parentheses)', () => {
        assert.deepEqual(chordBuilder.readChord('N.C.'), chordBuilder.blank());
        assert.deepEqual(chordBuilder.readChord('(G)'), chordBuilder.blank());
        assert.deepEqual(chordBuilder.readChord(''), chordBuilder.blank());
    });
});
