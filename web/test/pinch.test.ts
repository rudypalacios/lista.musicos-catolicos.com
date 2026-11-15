import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pinchSteps } from '../src/pinch.ts';

describe('pinchSteps', () => {
    it('is zero while the fingers barely move', () => {
        assert.equal(pinchSteps(200, 200, 19), 0);
        assert.equal(pinchSteps(200, 202, 19), 0);
        assert.equal(pinchSteps(200, 198, 19), 0);
    });

    it('opening the fingers is bigger, 1px at a time, in proportion to the letters', () => {
        assert.equal(pinchSteps(200, 210, 20), 1);
        assert.equal(pinchSteps(200, 220, 20), 2);
        assert.equal(pinchSteps(200, 400, 20), 20, 'twice as far apart: twice as big');
    });

    it('closing the fingers is smaller', () => {
        assert.equal(pinchSteps(200, 190, 20), -1);
        assert.equal(pinchSteps(200, 100, 20), -10, 'half as far apart: half as big');
    });

    it('moves more for bigger letters and less for smaller ones, for the same pinch', () => {
        assert.ok(pinchSteps(200, 240, 30) > pinchSteps(200, 240, 12));
    });

    it('ignores a distance or a size that is not a real measure', () => {
        assert.equal(pinchSteps(0, 100, 20), 0);
        assert.equal(pinchSteps(100, 0, 20), 0);
        assert.equal(pinchSteps(Number.NaN, 100, 20), 0);
        assert.equal(pinchSteps(100, 120, 0), 0);
    });
});
