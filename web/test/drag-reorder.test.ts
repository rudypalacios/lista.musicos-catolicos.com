import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dropIndex } from '../src/drag-reorder.ts';

describe('dropIndex', () => {
    // The centres of the rows that are not being dragged, from the top
    const centres = [100, 160, 220];

    it('is the number of the other rows whose centre is above the pointer', () => {
        assert.equal(dropIndex(centres, 50), 0, 'above them all: the start');
        assert.equal(dropIndex(centres, 101), 1);
        assert.equal(dropIndex(centres, 170), 2);
        assert.equal(dropIndex(centres, 400), 3, 'below them all: the end');
    });

    it('puts the pointer exactly on a centre before that row', () => {
        assert.equal(dropIndex(centres, 160), 1);
    });

    it('is 0 when there is nothing else', () => {
        assert.equal(dropIndex([], 123), 0);
    });
});
