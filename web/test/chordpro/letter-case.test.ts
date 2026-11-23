import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changeCase, changeCaseInRange } from '../../src/chordpro/letter-case.ts';

describe('changeCase', () => {
    it('lowercases the words and leaves the chords and the directives as they are', () => {
        assert.equal(changeCase('ALE[G]LUYA {ci: Bis}\n{c: Coro}\n[Am] [F]', 'lower'), 'ale[G]luya {ci: Bis}\n{c: Coro}\n[Am] [F]');
    });

    it('uppercases the words, accents and ñ included, and a chord in the middle of a word does not matter', () => {
        assert.equal(changeCase('prepa[G]rad el Se[D]ñor, árbol', 'upper'), 'PREPA[G]RAD EL SE[D]ÑOR, ÁRBOL');
    });

    it('is a capital at the start of each paragraph and sentence, and lowercase otherwise', () => {
        const text = 'ALELUYA[D]AAA[G]A, ALELUYA\nPREPARAD EL CAMINO DEL SEÑOR.\n\nALLANAD SUS SENDAS. LLEGÓ LA SALVACIÓN';
        assert.equal(changeCase(text, 'sentence'), 'Aleluya[D]aaa[G]a, aleluya\npreparad el camino del Señor.\n\nAllanad sus sendas. Llegó la salvación');
    });

    it('keeps the capital of the names of the faith, even with a chord inside them', () => {
        assert.equal(changeCase('GLORIA A DIOS Y AL SE[D]ÑOR JESÚS, ESPÍRITU SANTO', 'sentence'), 'Gloria a Dios y al Se[D]ñor Jesús, Espíritu Santo');
        assert.equal(changeCase('el padre y la señora', 'sentence'), 'El padre y la señora', 'a word that only starts like a name is not one');
    });

    it('starts a paragraph after a directive line, and after ¿ and ¡', () => {
        assert.equal(changeCase('{c: Coro}\nALELUYA, ALELUYA\n¡VEN, SEÑOR!', 'sentence'), '{c: Coro}\nAleluya, aleluya\n¡Ven, Señor!');
        assert.equal(changeCase('hola\n{c: Verso 2}\nadiós', 'sentence'), 'Hola\n{c: Verso 2}\nAdiós');
    });

    it('leaves a line of comment ("#") and a line of chords alone', () => {
        assert.equal(changeCase('# NOTA PARA MÍ\n[C] [G]\nHOLA', 'lower'), '# NOTA PARA MÍ\n[C] [G]\nhola');
    });

    it('never changes the length, so every chord keeps its place', () => {
        const text = 'STRAßE [G]ŉx\n{ci: X2} a[D]MÉN';
        for (const mode of ['lower', 'upper', 'sentence'] as const) {
            assert.equal(changeCase(text, mode).length, text.length, mode);
        }
    });

    it('does nothing to an empty text or one with no words', () => {
        assert.equal(changeCase('', 'upper'), '');
        assert.equal(changeCase('[C] [G]\n\n{soc}\n{eoc}', 'upper'), '[C] [G]\n\n{soc}\n{eoc}');
    });
});

describe('changeCaseInRange', () => {
    const text = 'Uno [C]DOS\ntres CUATRO\ncinco SEIS';

    it('takes the whole lines a selection touches, so a chord is never cut', () => {
        const from = text.indexOf('DOS');
        const to = text.indexOf('tres') + 2;
        const result = changeCaseInRange(text, from, to, 'lower');

        assert.equal(result.text, 'uno [C]dos\ntres cuatro\ncinco SEIS');
        assert.equal(result.text.slice(result.from, result.to), 'uno [C]dos\ntres cuatro');
    });

    it('works on the last line and on a selection that is only a cursor', () => {
        assert.equal(changeCaseInRange(text, text.length, text.length, 'upper').text, 'Uno [C]DOS\ntres CUATRO\nCINCO SEIS');
        assert.equal(changeCaseInRange('a\nb', 0, 0, 'upper').text, 'A\nb');
    });
});
