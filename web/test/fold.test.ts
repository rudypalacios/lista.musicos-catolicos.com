import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextFold, type FoldState } from '../src/fold.ts';

const open: FoldState = { folded: false, anchor: 0 };

describe('nextFold', () => {
    it('stays open for small moves and near the top', () => {
        assert.deepEqual(nextFold(open, 8), open);
        assert.deepEqual(nextFold(open, 50), open);
    });

    it('folds when the lyrics scroll down past the threshold', () => {
        assert.deepEqual(nextFold(open, 90), { folded: true, anchor: 90 });
    });

    it('stays folded while the lyrics keep going down or move a little', () => {
        const folded = { folded: true, anchor: 90 };
        assert.deepEqual(nextFold(folded, 95), folded);
        assert.deepEqual(nextFold(folded, 400), { folded: true, anchor: 400 });
    });

    it('opens on a short scroll up', () => {
        assert.deepEqual(nextFold({ folded: true, anchor: 400 }, 380), { folded: false, anchor: 380 });
    });

    it('opens at the very top whatever the anchor', () => {
        assert.deepEqual(nextFold({ folded: true, anchor: 5 }, 0), { folded: false, anchor: 0 });
    });
});
