import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeGuestWork, GUEST_OWNER, hasGuestWork, isGuest } from '../src/guest.ts';

describe('guest', () => {
    it('is told apart from any account by its owner, which is not an email', () => {
        assert.equal(isGuest(GUEST_OWNER), true);
        assert.equal(isGuest('a@example.com'), false);
        assert.equal(isGuest(null), false);
        assert.ok(!GUEST_OWNER.includes('@'), 'no account can ever have this owner');
    });

    it('has work to ask about only when something was written', () => {
        assert.equal(hasGuestWork({ songs: 0, lists: 0, templates: 0 }), false);
        assert.equal(hasGuestWork({ songs: 1, lists: 0, templates: 0 }), true);
        assert.equal(hasGuestWork({ songs: 0, lists: 0, templates: 2 }), true);
    });

    it('says what is on the device in words', () => {
        assert.equal(describeGuestWork({ songs: 0, lists: 0, templates: 0 }), '');
        assert.equal(describeGuestWork({ songs: 1, lists: 0, templates: 0 }), '1 canto');
        assert.equal(describeGuestWork({ songs: 12, lists: 0, templates: 0 }), '12 cantos');
        assert.equal(describeGuestWork({ songs: 12, lists: 2, templates: 0 }), '12 cantos y 2 listados');
        assert.equal(describeGuestWork({ songs: 1, lists: 1, templates: 1 }), '1 canto, 1 listado y 1 plantilla');
    });
});
