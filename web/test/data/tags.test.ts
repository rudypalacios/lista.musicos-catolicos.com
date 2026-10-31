import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanTags, hasTag, sameTag, tagOf, tagsInUse, untaggedUses, withTag } from '../../src/data/tags.ts';
import { ValidationError } from '../../src/data/library.ts';
import { LIMITS, type Song } from '../../src/data/types.ts';
import { setlist, song } from './store.contract.ts';

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

    describe('the songs the lists use in a section and that lack its tag', () => {
        const use = (part: string, ...songIds: string[]): ReturnType<typeof setlist> => setlist('l', 1, {
            items: songIds.map((songId, i) => ({ id: `i-${part}-${i}`, part, songId, transpose: 0, note: '' })),
        });
        const songs = [tagged('b', 'Adviento'), tagged('a'), tagged('c', 'Entrada'), tagged('d')];

        it('are the ones used in that section without the tag, each once, by title', () => {
            const lists = [use('entrada', 'a', 'b', 'c'), use('entrada', 'a'), use('salida', 'd')];

            assert.deepEqual(untaggedUses(lists, songs, 'entrada', 'Entrada').map((s) => s.id), ['a', 'b']);
        });

        it('leave out a song that has the tag in any spelling, one used elsewhere, and one with no room for another tag', () => {
            const full = tagged('f', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8');

            assert.deepEqual(untaggedUses([use('entrada', 'c', 'f')], [...songs, full], 'entrada', 'entrada'), []);
            assert.deepEqual(untaggedUses([use('salida', 'a')], songs, 'entrada', 'Entrada'), []);
        });

        it('are none when no list uses the section', () => {
            assert.deepEqual(untaggedUses([], songs, 'entrada', 'Entrada'), []);
        });
    });
});
