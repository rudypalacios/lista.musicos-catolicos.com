import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lockedNote } from '../src/views/sections.ts';

describe('lockedNote', () => {
    it('says how many songs keep a section on, in the singular and the plural', () => {
        assert.equal(lockedNote(1), '1 canto: no se puede apagar');
        assert.equal(lockedNote(3), '3 cantos: no se puede apagar');
    });
});
