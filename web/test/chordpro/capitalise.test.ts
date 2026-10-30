import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { capitaliseChords } from '../../src/chordpro/capitalise.ts';

describe('capitaliseChords', () => {
    it('capitalises the root of a chord written in lowercase', () => {
        assert.equal(capitaliseChords('[c]Hola [d]mundo'), '[C]Hola [D]mundo');
        assert.equal(capitaliseChords('[a]x [b]y [e]z'), '[A]x [B]y [E]z');
    });

    it('keeps the quality and the accidental', () => {
        assert.equal(capitaliseChords('[am]a [c#m7]b [bb]c [ebmaj7]d [gsus4]e [f#m]f [dm9]g'), '[Am]a [C#m7]b [Bb]c [Ebmaj7]d [Gsus4]e [F#m]f [Dm9]g');
    });

    it('capitalises the bass note too', () => {
        assert.equal(capitaliseChords('[g/b]a [d/f#]b [am/c]c'), '[G/B]a [D/F#]b [Am/C]c');
    });

    it('leaves what is already right, and what is not a chord, as it is', () => {
        const text = '[C]a [Am7]b [F#m]c [Do]d [x2] [bis] [N.C.] [add9] [dim] [h] [d.s.] [ ] []';
        assert.equal(capitaliseChords(text), text);
    });

    it('does not touch what is outside the brackets', () => {
        const text = '{c: coro}\n# a comment [c]\ncanto de entrada, de la a a la z';
        assert.equal(capitaliseChords(text), '{c: coro}\n# a comment [C]\ncanto de entrada, de la a a la z');
    });

    it('trims the inside of the bracket', () => {
        assert.equal(capitaliseChords('[ c ]Hola'), '[C]Hola');
    });

    it('capitalises a chord in parentheses, and leaves other parentheses alone', () => {
        assert.equal(capitaliseChords('[(g)]a [(am7)]b [(g/b)]c'), '[(G)]a [(Am7)]b [(G/B)]c');
        assert.equal(capitaliseChords('[(x2)]a [(bis)]b [()]c'), '[(x2)]a [(bis)]b [()]c');
    });
});
