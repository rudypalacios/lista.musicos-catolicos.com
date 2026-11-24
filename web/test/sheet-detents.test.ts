import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { levelsOf, pickLevel, velocityOf } from '../src/sheet-detents.ts';

describe('levelsOf', () => {
    it('has three levels when there is something to expand into, and two when there is not', () => {
        assert.deepEqual(levelsOf(200, 450), [['expanded', 0], ['low', 200], ['closed', 450]]);
        assert.deepEqual(levelsOf(0, 250), [['low', 0], ['closed', 250]]);
    });
});

describe('velocityOf', () => {
    it('is the speed over the samples, down positive', () => {
        assert.equal(velocityOf([{ time: 0, y: 100 }, { time: 50, y: 150 }]), 1);
        assert.equal(velocityOf([{ time: 0, y: 100 }, { time: 50, y: 50 }]), -1);
    });

    it('is nothing for one point, no points or no time passed', () => {
        assert.equal(velocityOf([]), 0);
        assert.equal(velocityOf([{ time: 5, y: 1 }]), 0);
        assert.equal(velocityOf([{ time: 5, y: 1 }, { time: 5, y: 90 }]), 0);
    });
});

describe('pickLevel', () => {
    const levels = levelsOf(200, 450);

    it('goes to the nearest level when let go slowly', () => {
        assert.equal(pickLevel(40, 0, levels), 'expanded');
        assert.equal(pickLevel(120, 0, levels), 'low');
        assert.equal(pickLevel(300, 0, levels), 'low');
        assert.equal(pickLevel(340, 0, levels), 'closed');
    });

    it('goes further the faster the flick: a quick one down from low closes it, a quick one up from low expands it', () => {
        assert.equal(pickLevel(210, 1.5, levels), 'closed');
        assert.equal(pickLevel(210, 0.1, levels), 'low');
        assert.equal(pickLevel(190, -1.5, levels), 'expanded');
    });

    it('closes from where it has only its low level', () => {
        const only = levelsOf(0, 250);

        assert.equal(pickLevel(30, 0, only), 'low');
        assert.equal(pickLevel(160, 0, only), 'closed');
    });
});
