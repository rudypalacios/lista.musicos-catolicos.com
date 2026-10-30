import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { keyDistance, nearestShift } from '../src/keys.ts';

describe('nearestShift', () => {
    it('keeps a shift the shortest way round', () => {
        assert.equal(nearestShift(0), 0);
        assert.equal(nearestShift(2), 2);
        assert.equal(nearestShift(7), -5);
        assert.equal(nearestShift(-7), 5);
        assert.equal(nearestShift(12), 0);
        assert.equal(nearestShift(-12), 0);
        assert.equal(nearestShift(6), 6);
        assert.equal(nearestShift(-6), 6);
    });
});

describe('keyDistance', () => {
    it('is how far up the second key is, the shortest way', () => {
        assert.equal(keyDistance('C', 'D'), 2);
        assert.equal(keyDistance('D', 'C'), -2);
        assert.equal(keyDistance('C', 'A'), -3);
        assert.equal(keyDistance('G', 'C'), 5);
        assert.equal(keyDistance('C', 'F#'), 6);
    });

    it('reads sharps and flats, and ignores minor and major', () => {
        assert.equal(keyDistance('C', 'Bb'), -2);
        assert.equal(keyDistance('C', 'C#'), 1);
        assert.equal(keyDistance('Am', 'A'), 0);
        assert.equal(keyDistance('Em', 'Fm'), 1);
        assert.equal(keyDistance('B', 'C'), 1);
        assert.equal(keyDistance('Cb', 'C'), 1);
    });

    it('is null when a song has no key', () => {
        assert.equal(keyDistance(null, 'C'), null);
        assert.equal(keyDistance('C', null), null);
        assert.equal(keyDistance('N.C.', 'C'), null);
    });
});
