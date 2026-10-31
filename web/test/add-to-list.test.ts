import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { partNote } from '../src/views/add-to-list.ts';

describe('partNote', () => {
    it('says the song is already there before anything else', () => {
        assert.equal(partNote({ optional: true }, 3, true), 'Ya está aquí');
    });

    it('counts the songs a part holds', () => {
        assert.equal(partNote({}, 1, false), '1 canto');
        assert.equal(partNote({}, 4, false), '4 cantos');
    });

    it('marks an empty optional part, and says nothing of an empty required one', () => {
        assert.equal(partNote({ optional: true }, 0, false), 'opcional');
        assert.equal(partNote({}, 0, false), '');
    });
});
