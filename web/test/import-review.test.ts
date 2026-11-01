import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { alreadyHave, bytesLabel, firstOfBatch, footOf, heldSong, pagesLabel, readingLabel, readingPercent, repeatedInBatch, sizeLabel, suggestedTitle } from '../src/import-review.ts';
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

describe('repeatedInBatch', () => {
    it('marks the copies after the first, not the first', () => {
        const a = { title: 'Gloria', body: '[C]Gloria' };
        const b = { title: 'Santo', body: '[G]Santo' };
        assert.deepEqual(repeatedInBatch([a, b, { ...a }, { title: ' gloria ', body: '[C]Gloria\n' }]), [false, false, true, true]);
    });

    it('needs the same text: a repeated title alone is allowed', () => {
        assert.deepEqual(repeatedInBatch([{ title: 'Gloria', body: 'a' }, { title: 'Gloria', body: 'b' }]), [false, false]);
    });

    it('counts two identical songs with no title', () => {
        assert.deepEqual(repeatedInBatch([{ title: '', body: 'same' }, { title: '', body: 'same' }]), [false, true]);
    });
});

describe('what the reading of a file says', () => {
    it('counts pages and sizes in Spanish', () => {
        assert.equal(pagesLabel(1), '1 página');
        assert.equal(pagesLabel(4), '4 páginas');
        assert.equal(bytesLabel(0), '1 KB');
        assert.equal(bytesLabel(186_368), '182 KB');
        assert.equal(bytesLabel(1_468_006), '1,4 MB');
    });

    it('names the page being read, and the opening before pages are counted', () => {
        assert.equal(readingLabel(0, 0), 'Abriendo el PDF…');
        assert.equal(readingLabel(0, 4), 'Leyendo página 1 de 4…');
        assert.equal(readingLabel(1, 4), 'Leyendo página 2 de 4…');
        assert.equal(readingLabel(4, 4), 'Leyendo página 4 de 4…');
    });

    it('fills the bar by pages read, never past full', () => {
        assert.equal(readingPercent(0, 0), 0);
        assert.equal(readingPercent(1, 4), 25);
        assert.equal(readingPercent(9, 4), 100);
    });
});

describe('heldSong and firstOfBatch', () => {
    it('gives the song the person already has, not only that there is one', () => {
        const saved = [{ id: 'a', title: 'Gloria', body: '[D]Gloria a Dios' }, { id: 'b', title: 'Santo', body: '[G]Santo' }];

        assert.equal(heldSong({ title: ' gloria ', body: '[D]Gloria a Dios\n' }, saved)?.id, 'a');
        assert.equal(heldSong({ title: 'Santo', body: 'otra' }, saved), undefined);
        assert.equal(heldSong({ title: '', body: '[G]Santo' }, saved), undefined);
    });

    it('says which row a repeat repeats', () => {
        const songs = [{ title: 'A', body: 'x' }, { title: 'B', body: 'y' }, { title: 'a', body: 'x' }, { title: 'A', body: 'z' }, { title: 'A', body: 'x' }];

        assert.deepEqual(firstOfBatch(songs), [0, 1, 0, 3, 0]);
    });
});
