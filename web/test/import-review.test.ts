import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alreadyHave, footOf, sizeLabel, suggestedTitle } from '../src/import-review.ts';
import { attentionOf } from '../src/importer.ts';

describe('sizeLabel', () => {
    it('counts chords and lines, in the singular too', () => {
        assert.equal(sizeLabel('[C]Uno [G]dos\ntres'), '2 acordes · 2 líneas');
        assert.equal(sizeLabel('[C]Uno'), '1 acorde · 1 línea');
        assert.equal(sizeLabel(''), '0 acordes · 0 líneas');
    });
});

describe('suggestedTitle', () => {
    it('is the first line of the lyrics without its chords', () => {
        assert.equal(suggestedTitle('{c: Verso 1}\n[C]Caminamos con a[G]legría,\notra'), 'Caminamos con alegría,');
    });

    it('skips directives, comments and empty lines', () => {
        assert.equal(suggestedTitle('\n# nota\n{key: G}\n[C] [G]\n  Gloria a Dios'), 'Gloria a Dios');
    });

    it('is null when there are no words', () => {
        assert.equal(suggestedTitle('[C] [G]\n{ci: x2}'), null);
        assert.equal(suggestedTitle(''), null);
    });

    it('is cut at a word when the line is long', () => {
        const long = 'palabra '.repeat(20).trim();
        const title = suggestedTitle(long) ?? '';

        assert.ok(title.length <= 80 && title.endsWith('palabra'), title);
    });
});

describe('alreadyHave', () => {
    const saved = [{ title: 'Gloria', body: '[D]Gloria a Dios' }];

    it('needs the same title and the same text', () => {
        assert.equal(alreadyHave({ title: ' gloria ', body: '[D]Gloria a Dios\n' }, saved), true);
        assert.equal(alreadyHave({ title: 'Gloria', body: '[G]Otra letra' }, saved), false);
        assert.equal(alreadyHave({ title: 'Santo', body: '[D]Gloria a Dios' }, saved), false);
    });

    it('is never true for an untitled song', () => {
        assert.equal(alreadyHave({ title: '', body: '[D]Gloria a Dios' }, [{ title: '', body: '[D]Gloria a Dios' }]), false);
    });
});

describe('footOf', () => {
    it('lets the person save when every marked song has a title', () => {
        assert.deepEqual(footOf([{ included: true, title: 'A' }, { included: false, title: '' }]), { message: '', canSave: true, saving: 1 });
    });

    it('blocks the save, and says how many titles are missing', () => {
        assert.deepEqual(
            footOf([{ included: true, title: '' }, { included: true, title: ' ' }, { included: true, title: 'C' }]),
            { message: 'Falta el título de 2 cantos', canSave: false, saving: 3 },
        );
        assert.equal(footOf([{ included: true, title: '' }]).message, 'Falta el título de 1 canto');
    });

    it('does not count a song that is not marked', () => {
        assert.equal(footOf([{ included: false, title: '' }, { included: true, title: 'A' }]).canSave, true);
    });

    it('blocks the save when nothing is marked', () => {
        assert.deepEqual(footOf([{ included: false, title: 'A' }]), { message: 'Marca al menos un canto', canSave: false, saving: 0 });
        assert.equal(footOf([]).canSave, false);
    });
});

describe('attentionOf', () => {
    it('leaves out the report of chords written in the standard form', () => {
        assert.deepEqual(attentionOf(['35 acordes escritos con otra notación (guion, paréntesis o nombres en español) se pasó a la forma estándar.']), []);
        assert.deepEqual(attentionOf(['1 acorde escrito con otra notación (guion, paréntesis o nombres en español) se pasó a la forma estándar.']), []);
    });

    it('names what needs a look, each once', () => {
        assert.deepEqual(
            attentionOf([
                'La hoja tenía dos columnas: leí primero la izquierda y después la derecha.',
                'No encontré acordes: la letra se guardará sin ellos.',
                'Acordes sin letra debajo: DO',
                'Acordes sin letra debajo: SOL',
                'Entendí “(C2)” del encabezado como cejilla en el traste 2.',
            ]),
            ['Dos columnas', 'Sin acordes', 'Acordes sin letra', 'Cejilla'],
        );
    });
});
