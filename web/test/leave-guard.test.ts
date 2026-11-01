import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { askToLeave, leaveIsRisky, setLeaveGuard } from '../src/leave-guard.ts';

describe('leave guard', () => {
    afterEach(() => setLeaveGuard(null));

    it('lets the person leave when there is no guard or nothing to lose, without asking', async () => {
        let asked = 0;
        assert.equal(leaveIsRisky(), false);
        assert.equal(await askToLeave(), true);
        setLeaveGuard({ isDirty: () => false, ask: () => { asked++; return Promise.resolve(false); } });
        assert.equal(leaveIsRisky(), false);
        assert.equal(await askToLeave(), true);
        assert.equal(asked, 0);
    });

    it('asks when something would be lost, and follows the answer', async () => {
        setLeaveGuard({ isDirty: () => true, ask: () => Promise.resolve(false) });
        assert.equal(leaveIsRisky(), true);
        assert.equal(await askToLeave(), false);
        setLeaveGuard({ isDirty: () => true, ask: () => Promise.resolve(true) });
        assert.equal(await askToLeave(), true);
    });
});
