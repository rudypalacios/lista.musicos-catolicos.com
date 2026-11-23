import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changeCase, changeCaseInRange } from '../../src/chordpro/letter-case.ts';

describe('changeCase', () => {
    it('lowercases and uppercases the words, and leaves the chords and the directives as they are', () => {
        const text = 'Ale[Am]LUYA {ci: Bis}\n{c: Coro}\n[F#m7/C#] Señor';

        assert.equal(changeCase(text, 'lower'), 'ale[Am]luya {ci: Bis}\n{c: Coro}\n[F#m7/C#] señor');
        assert.equal(changeCase(text, 'upper'), 'ALE[Am]LUYA {ci: Bis}\n{c: Coro}\n[F#m7/C#] SEÑOR');
    });

    it('is a capital at the start of the text, of each paragraph and of each sentence, and lowercase otherwise', () => {
        const text = 'ALELUYA[D]AAA[G]A, ALELUYA\nPREPARAD EL SEÑOR.\n\nALLANAD SUS SENDAS. ¿LLEGÓ? ¡SÍ!';

        assert.equal(changeCase(text, 'sentence'), 'Aleluya[D]aaa[G]a, aleluya\npreparad el señor.\n\nAllanad sus sendas. ¿Llegó? ¡Sí!');
    });

    it('starts a paragraph after a directive on a line of its own, not after a note at the end of a line', () => {
        assert.equal(changeCase('{c: Coro}\nALELUYA, ALELUYA\n{c: Verso 2}\nADIÓS', 'sentence'), '{c: Coro}\nAleluya, aleluya\n{c: Verso 2}\nAdiós');
        assert.equal(changeCase('HOLA {ci: BIS}\nOTRA VEZ', 'sentence'), 'Hola {ci: BIS}\notra vez');
    });

    it('does nothing to an empty text or one of chords only', () => {
        assert.equal(changeCase('', 'upper'), '');
        assert.equal(changeCase('[C] [G]\n\n{soc}\n{eoc}', 'upper'), '[C] [G]\n\n{soc}\n{eoc}');
    });
});

describe('changeCaseInRange', () => {
    it('changes only the lines the selection touches, whole, and never a chord (not even one typed in lowercase)', () => {
        const song = 'Ale[g]luya, ale[Am]LUYA\nprepa[G]rad EL ca[a]mino\ntercera [D]LÍNEA';
        const result = changeCaseInRange(song, song.indexOf('luya'), song.indexOf('EL') + 2, 'upper');

        assert.equal(result.text, 'ALE[g]LUYA, ALE[Am]LUYA\nPREPA[G]RAD EL CA[a]MINO\ntercera [D]LÍNEA');
        assert.equal(result.text.slice(result.from, result.to), 'ALE[g]LUYA, ALE[Am]LUYA\nPREPA[G]RAD EL CA[a]MINO');
    });

    it('works on the last line and on a selection that is only a cursor', () => {
        const text = 'Uno [C]DOS\ntres CUATRO\ncinco SEIS';

        assert.equal(changeCaseInRange(text, text.length, text.length, 'upper').text, 'Uno [C]DOS\ntres CUATRO\nCINCO SEIS');
        assert.equal(changeCaseInRange('a\nb', 0, 0, 'upper').text, 'A\nb');
    });
});
