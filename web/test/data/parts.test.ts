import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { notedIn, optionalIn } from '../../src/data/parts.ts';
import type { PartDef } from '../../src/data/types.ts';

const parts: PartDef[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', optional: true, note: 'Por qué' }];

describe('optionalIn', () => {
    it('marks and unmarks one section, leaving the rest as they are', () => {
        assert.deepEqual(optionalIn(parts, 'a', true)[0], { id: 'a', name: 'A', optional: true });
        assert.deepEqual(optionalIn(parts, 'b', false)[1], { id: 'b', name: 'B', note: 'Por qué' });
        assert.deepEqual(optionalIn(parts, 'zz', true), parts);
    });
});

describe('notedIn', () => {
    it('sets the explanation, and a blank one removes it', () => {
        assert.equal(notedIn(parts, 'a', 'Nota')[0]?.note, 'Nota');
        assert.equal('note' in (notedIn(parts, 'b', '  ')[1] ?? {}), false);
        assert.equal(notedIn(parts, 'b', 'Otra')[1]?.optional, true);
    });
});
