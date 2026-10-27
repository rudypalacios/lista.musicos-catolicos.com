import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestSize } from '../src/fit.ts';

const limits = { min: 13, max: 34, step: 0.5 };

describe('bestSize', () => {
    it('finds the largest size that fits', () => {
        for (const biggest of [13, 13.5, 20, 27.5, 33.5]) {
            assert.deepEqual(bestSize(limits, (size) => size <= biggest), { size: biggest, fits: true });
        }
    });

    it('stops at the maximum when everything fits', () => {
        assert.deepEqual(bestSize(limits, () => true), { size: 34, fits: true });
    });

    it('reports that it does not fit when even the minimum is too big', () => {
        assert.deepEqual(bestSize(limits, () => false), { size: 13, fits: false });
        assert.deepEqual(bestSize(limits, (size) => size < 13), { size: 13, fits: false });
    });

    it('measures a dozen times, not once per step', () => {
        let measurements = 0;
        bestSize(limits, (size) => {
            measurements++;

            return size <= 22;
        });

        assert.ok(measurements <= 10, `measured ${measurements} times`);
    });

    it('only returns sizes on the step grid', () => {
        const { size } = bestSize({ min: 12, max: 30, step: 1 }, (s) => s <= 21.7);

        assert.equal(size, 21);
    });

    it('works when the range is a single step', () => {
        assert.deepEqual(bestSize({ min: 10, max: 10.5, step: 0.5 }, (s) => s <= 10), { size: 10, fits: true });
    });
});
