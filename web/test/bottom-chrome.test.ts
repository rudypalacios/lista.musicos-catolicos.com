import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liftAbove } from '../src/bottom-chrome.ts';

describe('liftAbove', () => {
    const viewport = 800;

    it('is nothing when no bar rests at the bottom', () => {
        assert.equal(liftAbove([], viewport), 0);
    });

    it('lifts a message over the menu of a phone', () => {
        assert.equal(liftAbove([{ top: 744, bottom: 800 }], viewport), 56);
    });

    it('takes the tallest of the bars stacked at the bottom (the install bar above the menu)', () => {
        assert.equal(liftAbove([{ top: 744, bottom: 800 }, { top: 700, bottom: 744 }], viewport), 100);
    });

    it('ignores a bar that is not on screen or not at the bottom', () => {
        assert.equal(liftAbove([{ top: 0, bottom: 0 }, { top: 0, bottom: 48 }], viewport), 0);
    });

    it('ignores the rail of a wide screen, which fills the height at the side', () => {
        assert.equal(liftAbove([{ top: 0, bottom: 800 }], viewport), 0);
    });
});
