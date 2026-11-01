import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { armedMessage, entriesOf, planPlacements, type Entry, type ImportRow } from '../src/import-list.ts';
import { blankSections } from '../src/data/templates.ts';
import { massSections } from '../src/mass.ts';
import type { PartDef } from '../src/data/types.ts';

const row = (index: number, over: Partial<ImportRow> = {}): ImportRow => ({ included: true, heldId: null, sameAs: index, tags: [], ...over });
const entry = (rowIndex: number, ...tags: string[]): Entry => ({ row: rowIndex, tags });

describe('entriesOf', () => {
    it('takes the marked rows, in the order of the file', () => {
        assert.deepEqual(entriesOf([row(0, { tags: ['Entrada'] }), row(1), row(2, { tags: ['Gloria'] })]).map((e) => [e.row, e.tags]), [[0, ['Entrada']], [1, []], [2, ['Gloria']]]);
    });

    it('leaves out a row the person unmarked on purpose', () => {
        assert.deepEqual(entriesOf([row(0), row(1, { included: false }), row(2)]).map((e) => e.row), [0, 2]);
    });

    it('takes a song the person already has, even unmarked: it stands for theirs', () => {
        assert.deepEqual(entriesOf([row(0, { included: false, heldId: 'mine' })]).map((e) => e.row), [0]);
    });

    it('takes a repeat when the row it repeats goes, and not when it does not', () => {
        assert.deepEqual(entriesOf([row(0), row(1, { included: false, sameAs: 0 })]).map((e) => e.row), [0, 1]);
        assert.deepEqual(entriesOf([row(0, { included: false }), row(1, { included: false, sameAs: 0 })]).map((e) => e.row), []);
    });

    it('does not loop on rows that point at each other', () => {
        assert.deepEqual(entriesOf([row(0, { included: false, sameAs: 1 }), row(1, { included: false, sameAs: 0 })]), []);
    });
});

describe('planPlacements', () => {
    it('puts each song in the section whose tag it carries, the Mass\'s short tags included', () => {
        const { placed, leftOut } = planPlacements([entry(0, 'Entrada'), entry(1, 'comunion'), entry(2, 'Gloria')], massSections());

        assert.deepEqual(placed, [{ part: 'entrada', key: 0 }, { part: 'comunion', key: 1 }, { part: 'gloria', key: 2 }]);
        assert.deepEqual(leftOut, []);
    });

    it('leaves out what fits no section, and what has no tag', () => {
        const { placed, leftOut } = planPlacements([entry(0, 'Entrada'), entry(1), entry(2, 'Adviento')], massSections());

        assert.deepEqual(placed, [{ part: 'entrada', key: 0 }]);
        assert.deepEqual(leftOut.map((e) => e.row), [1, 2]);
    });

    it('matches a section of the person\'s own by its name, without accents or capitals', () => {
        const rosary: PartDef[] = [{ id: 'p-1', name: 'Primer misterio' }, { id: 'p-2', name: 'Salve' }];
        const { placed } = planPlacements([entry(0, 'primer MISTERIO'), entry(1, 'salve')], rosary);

        assert.deepEqual(placed, [{ part: 'p-1', key: 0 }, { part: 'p-2', key: 1 }]);
    });

    it('puts everything in a blank list, tagged or not, in the order of the file', () => {
        const { placed, leftOut } = planPlacements([entry(0), entry(1, 'Entrada'), entry(2)], blankSections());

        assert.deepEqual(placed.map((p) => p.key), [0, 1, 2]);
        assert.equal(new Set(placed.map((p) => p.part)).size, 1);
        assert.deepEqual(leftOut, []);
    });

    it('keeps the order of the file inside a section', () => {
        const { placed } = planPlacements([entry(0, 'Comunión'), entry(1, 'Entrada'), entry(2, 'Comunión')], massSections());

        assert.deepEqual(placed.filter((p) => p.part === 'comunion').map((p) => p.key), [0, 2]);
    });

    it('does not put the same song twice in one section', () => {
        const same = (a: number, b: number): boolean => a === b || (a === 0 && b === 1) || (a === 1 && b === 0);
        const { placed } = planPlacements([entry(0, 'Entrada'), entry(1, 'Entrada')], massSections(), same);

        assert.deepEqual(placed, [{ part: 'entrada', key: 0 }]);
    });

    it('does not use a section that is switched off', () => {
        const parts = massSections().map((part) => (part.id === 'entrada' ? { ...part, off: true as const } : part));

        assert.deepEqual(planPlacements([entry(0, 'Entrada')], parts).leftOut.map((e) => e.row), [0]);
    });
});

describe('armedMessage', () => {
    it('says how many songs the list has', () => {
        assert.equal(armedMessage(1, 0), 'Listado armado con 1 canto.');
        assert.equal(armedMessage(4, 0), 'Listado armado con 4 cantos.');
    });

    it('says how many did not fit, in the singular and the plural', () => {
        assert.equal(armedMessage(3, 1), 'Listado armado con 3 cantos. 1 no encajó en ninguna sección y quedó solo en Cantos.');
        assert.equal(armedMessage(3, 2), 'Listado armado con 3 cantos. 2 no encajaron en ninguna sección y quedaron solo en Cantos.');
    });
});
