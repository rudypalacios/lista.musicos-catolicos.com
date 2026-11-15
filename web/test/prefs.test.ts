import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLyricSizes } from '../src/prefs.ts';

describe('parseLyricSizes', () => {
    it('reads the size of each song, by id', () => {
        assert.deepEqual(parseLyricSizes('{"a":3,"b":-2}'), { a: 3, b: -2 });
    });

    it('is empty when nothing was stored', () => {
        assert.deepEqual(parseLyricSizes(null), {});
    });

    it('survives text that is not a record of sizes', () => {
        assert.deepEqual(parseLyricSizes('not json'), {});
        assert.deepEqual(parseLyricSizes('[1,2]'), {});
        assert.deepEqual(parseLyricSizes('7'), {});
        assert.deepEqual(parseLyricSizes('null'), {});
    });

    it('leaves out what is not a whole number of steps, and zero (no change)', () => {
        assert.deepEqual(parseLyricSizes('{"a":1.5,"b":"2","c":0,"d":4}'), { d: 4 });
    });
});
