import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse, songKey } from '../../src/chordpro/parser.ts';
import { transposeBody } from '../../src/chordpro/transpose-body.ts';

describe('transposeBody', () => {
    it('moves every chord and keeps the lyrics as written', () => {
        assert.equal(transposeBody('[F]Abrimos la [Bb]puerta\n[C7]Amén', -1), '[E]Abrimos la [A]puerta\n[B7]Amén');
    });

    it('moves the bass note, chords in parentheses and chords typed in Latin (stored in English, black keys as flats like the site)', () => {
        assert.equal(transposeBody('[D/F#]a [(G)]b [Sol]c [Lam7]d', 2), '[E/Ab]a [(A)]b [A]c [Bm7]d');
    });

    it('moves the key directive, whatever notation it is written in', () => {
        assert.equal(transposeBody('{key: F}\n[F]x', -1), '{key: E}\n[E]x');
        assert.equal(transposeBody('{key:Sol}\n[G]x', 2), '{key:A}\n[A]x');
    });

    it('leaves what is not a chord alone', () => {
        const text = '{capo: 2}\n[x2] coro [bis] [N.C.]\n{title: Do re mi}';
        assert.equal(transposeBody(text, 3), text);
    });

    it('is the text itself for no move, and the key of the song follows the move', () => {
        const text = '[A]Gloria [E]a Dios';
        assert.equal(transposeBody(text, 0), text);
        assert.equal(songKey(parse(transposeBody(text, -2))), 'G');
    });

    it('is undone by moving back', () => {
        const text = '{key: Em}\n[Em]Alle[B7]luya [C/E]hoy [Am]';
        assert.equal(transposeBody(transposeBody(text, 5), -5), text);
    });
});
