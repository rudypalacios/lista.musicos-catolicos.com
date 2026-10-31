import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanTags, hasTag, sameTag, tagOf, tagsInUse, withTag } from '../../src/data/tags.ts';
import { ValidationError } from '../../src/data/library.ts';
import { LIMITS, type Song } from '../../src/data/types.ts';
import { song } from './store.contract.ts';

const tagged = (id: string, ...tags: string[]): Song => song(id, 1, { tags });

describe('tags', () => {
    it('are the same tag in any spelling of accents and capitals', () => {
        assert.equal(sameTag('Comunión', 'comunion'), true);
        assert.equal(sameTag('Señor ten piedad', 'SEÑOR  TEN PIEDAD'), true);
        assert.equal(sameTag('Entrada', 'Salida'), false);
    });

    it('are cleaned: spaces collapsed, none empty, one spelling each (the first), in the order given', () => {
        assert.deepEqual(cleanTags([' Señor   ten piedad ', '', 'senor ten piedad', 'Entrada']), ['Señor ten piedad', 'Entrada']);
    });

    it('are limited to eight, of thirty characters, and the message says it in Spanish', () => {
        assert.equal(cleanTags(Array.from({ length: LIMITS.tags }, (_, i) => `T${i}`)).length, 8);
        assert.throws(() => cleanTags(Array.from({ length: LIMITS.tags + 1 }, (_, i) => `T${i}`)), ValidationError);
        assert.throws(() => cleanTags(['x'.repeat(LIMITS.tag + 1)]), /hasta 30 caracteres/);
        // Repeats are dropped before they count
        assert.equal(cleanTags(Array.from({ length: 20 }, () => 'Igual')).length, 1);
    });

    it('say whether a song carries one, and pick the songs that do', () => {
        const songs = [tagged('a', 'Entrada'), tagged('b', 'Comunión', 'Adviento'), tagged('c')];

        assert.equal(hasTag(songs[1] as Song, 'comunion'), true);
        assert.equal(hasTag(songs[2] as Song, 'Entrada'), false);
        assert.deepEqual(withTag(songs, 'ENTRADA').map((s) => s.id), ['a']);
    });

    it('of a section: the short one of the Mass by its id (so renaming it leaves it), the name of any other', () => {
        assert.equal(tagOf({ id: 'entrada', name: 'Canto de entrada' }), 'Entrada');
        assert.equal(tagOf({ id: 'entrada', name: 'Entrada de la misa' }), 'Entrada');
        assert.equal(tagOf({ id: 'comunion', name: 'Canto de comunión' }), 'Comunión');
        assert.equal(tagOf({ id: 'p-abc12345', name: 'Primer misterio' }), 'Primer misterio');
    });

    it('in use come once each, the most used first and then by name', () => {
        const songs = [tagged('a', 'Entrada', 'Adviento'), tagged('b', 'entrada'), tagged('c', 'Salida', 'Adviento'), tagged('d', 'Adviento')];

        assert.deepEqual(tagsInUse(songs), ['Adviento', 'Entrada', 'Salida']);
    });
});
