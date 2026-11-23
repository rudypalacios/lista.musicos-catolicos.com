import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canJoin, pageIndexOf, pagesOf, positionText, squaresLayout } from '../../src/data/pages.ts';

/** Items with just what the pages read: song 1…n in order, `joins` says which are divided with the next */
const items = (count: number, joins: readonly number[] = []): { id: string; withNext?: string }[] =>
    Array.from({ length: count }, (_, i) => ({ id: `s${i + 1}`, ...(joins.includes(i + 1) ? { withNext: `s${i + 2}` } : {}) }));

const ids = (pages: { id: string }[][]): string[] => pages.map((page) => page.map((item) => item.id).join('+'));

describe('pagesOf', () => {
    it('is a page for each song when nothing is divided', () => {
        assert.deepEqual(ids(pagesOf(items(4))), ['s1', 's2', 's3', 's4']);
    });

    it('puts a divided pair on one page: 1, 2 and 3, 4 → 1 · 2+3 · 4', () => {
        assert.deepEqual(ids(pagesOf(items(4, [2]))), ['s1', 's2+s3', 's4']);
    });

    it('allows several pairs, and two pairs side by side', () => {
        assert.deepEqual(ids(pagesOf(items(6, [1, 3, 5]))), ['s1+s2', 's3+s4', 's5+s6']);
    });

    it('ignores a union whose song is no longer the next one (moved or removed), and counts it again if they are side by side', () => {
        const apart = [{ id: 's1', withNext: 's3' }, { id: 's2' }, { id: 's3' }];
        assert.deepEqual(ids(pagesOf(apart)), ['s1', 's2', 's3']);
        const together = [{ id: 's1', withNext: 's3' }, { id: 's3' }, { id: 's2' }];
        assert.deepEqual(ids(pagesOf(together)), ['s1+s3', 's2']);
    });

    it('never makes a song the second of one pair and the first of another: it is read from the left', () => {
        assert.deepEqual(ids(pagesOf(items(4, [1, 2]))), ['s1+s2', 's3', 's4']);
    });

    it('ignores a union on the last song', () => {
        assert.deepEqual(ids(pagesOf([{ id: 's1' }, { id: 's2', withNext: 's9' }])), ['s1', 's2']);
    });
});

describe('pageIndexOf', () => {
    it('finds the page of either song of a pair, and -1 for one that is not there', () => {
        const pages = pagesOf(items(4, [2]));
        assert.equal(pageIndexOf(pages, 's2'), 1);
        assert.equal(pageIndexOf(pages, 's3'), 1);
        assert.equal(pageIndexOf(pages, 's4'), 2);
        assert.equal(pageIndexOf(pages, 'nope'), -1);
    });
});

describe('canJoin', () => {
    it('allows a song alone to share its page with the next one', () => {
        assert.deepEqual(canJoin(items(4), 's2'), { ok: true });
    });

    it('refuses the last song, saying why', () => {
        assert.deepEqual(canJoin(items(3), 's3'), { ok: false, reason: 'Es el último canto: no hay uno siguiente para unir.' });
    });

    it('refuses when the next one is already the first of a pair', () => {
        assert.deepEqual(canJoin(items(4, [3]), 's2'), { ok: false, reason: 'El canto siguiente ya está unido con otro.' });
    });

    it('refuses the second song of a pair: it is not alone on its page', () => {
        assert.deepEqual(canJoin(items(4, [1]), 's2'), { ok: false, reason: 'Estos dos cantos ya están unidos.' });
    });

    it('refuses a pair (it is separated, not joined) and a song that is not in the list', () => {
        assert.equal(canJoin(items(4, [2]), 's2').ok, false);
        assert.deepEqual(canJoin(items(2), 'nope'), { ok: false, reason: 'El canto ya no está en el listado.' });
    });
});

describe('positionText', () => {
    it('counts songs, not pages', () => {
        const order = items(4, [2]);
        const pages = pagesOf(order);
        assert.equal(positionText(order, pages[0] ?? []), '1/4');
        assert.equal(positionText(order, pages[1] ?? []), '2–3/4');
    });
});

describe('squaresLayout', () => {
    it('is side by side on a wide screen and one over the other otherwise', () => {
        assert.equal(squaresLayout(1180, 820), 'row');
        assert.equal(squaresLayout(820, 1180), 'column');
        assert.equal(squaresLayout(390, 800), 'column');
        assert.equal(squaresLayout(800, 800), 'column');
    });
});
