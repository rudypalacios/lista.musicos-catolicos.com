import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PINCH_STEP_RATIO, pinchSteps } from '../src/pinch.ts';

describe('pinchSteps', () => {
    it('is zero while the fingers barely move', () => {
        assert.equal(pinchSteps(200, 200), 0);
        assert.equal(pinchSteps(200, 215), 0);
        assert.equal(pinchSteps(200, 190), 0);
    });

    it('opening the fingers is bigger, one step each time the distance grows by the ratio', () => {
        assert.equal(pinchSteps(200, 200 * PINCH_STEP_RATIO), 1);
        assert.equal(pinchSteps(200, 200 * PINCH_STEP_RATIO ** 2), 2);
    });

    it('closing the fingers is smaller', () => {
        assert.equal(pinchSteps(200, 200 / PINCH_STEP_RATIO), -1);
        assert.equal(pinchSteps(200, 200 / PINCH_STEP_RATIO ** 3), -3);
    });

    it('ignores a distance that is not a real measure', () => {
        assert.equal(pinchSteps(0, 100), 0);
        assert.equal(pinchSteps(100, 0), 0);
        assert.equal(pinchSteps(Number.NaN, 100), 0);
    });
});
