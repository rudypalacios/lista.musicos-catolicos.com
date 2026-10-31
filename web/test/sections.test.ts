import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { massSections } from '../src/mass.ts';
import { lockedNote, missingFromMass } from '../src/views/sections.ts';

describe('lockedNote', () => {
    it('says how many songs keep a section on, in the singular and the plural', () => {
        assert.equal(lockedNote(1), '1 canto: no se puede apagar');
        assert.equal(lockedNote(3), '3 cantos: no se puede apagar');
    });
});

describe('missingFromMass', () => {
    it('offers every section of the Mass to a list that has none of them, in the order of the Mass', () => {
        const missing = missingFromMass([{ id: 'p-uno', name: 'Rosario' }]);

        assert.deepEqual(missing.map((part) => part.id), massSections().map((part) => part.id));
    });

    it('does not offer the ones the list has, switched off or not', () => {
        const have = massSections().filter((part) => part.id === 'gloria' || part.id === 'salida').map((part) => (part.id === 'salida' ? { ...part, off: true as const } : part));

        const ids = missingFromMass(have).map((part) => part.id);

        assert.ok(!ids.includes('gloria') && !ids.includes('salida'));
        assert.equal(ids.length, massSections().length - 2);
    });
});
