import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dragOffset, isSwipe, swipeAxis } from '../src/swipe.ts';

describe('swipeAxis', () => {
    it('waits until the finger has moved enough to tell', () => {
        assert.equal(swipeAxis(4, 3), null);
        assert.equal(swipeAxis(-9, 0), null);
    });

    it('calls a mostly sideways move horizontal, in either direction', () => {
        assert.equal(swipeAxis(30, 5), 'x');
        assert.equal(swipeAxis(-30, 5), 'x');
    });

    it('leaves slanted and vertical moves to the scroll', () => {
        assert.equal(swipeAxis(20, 20), 'y');
        assert.equal(swipeAxis(5, -40), 'y');
    });
});

describe('isSwipe', () => {
    it('needs a long enough, mostly horizontal move', () => {
        assert.equal(isSwipe(-400, 0), true);
        assert.equal(isSwipe(60, 10), true);
        assert.equal(isSwipe(30, 0), false);
        assert.equal(isSwipe(100, 90), false);
    });
});

describe('dragOffset', () => {
    it('follows the finger when there is a song on that side', () => {
        assert.equal(dragOffset(-80, true), -80);
    });

    it('holds the page back at the first and the last song', () => {
        assert.equal(dragOffset(80, false), 20);
    });
});
