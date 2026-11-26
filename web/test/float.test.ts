import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KEEP, clampPlace, defaultPlace } from '../src/views/float.ts';

const wide = { width: 1280, height: 800 };
const phone = { width: 390, height: 780 };
const box = { width: 384, height: 260 };

describe('clampPlace', () => {
    it('keeps the window whole inside a wide screen', () => {
        assert.deepEqual(clampPlace({ x: -50, y: -9 }, wide, box, 46), { x: 0, y: 0 });
        assert.deepEqual(clampPlace({ x: 5000, y: 5000 }, wide, box, 46), { x: 1280 - 384, y: 800 - 260 });
        assert.deepEqual(clampPlace({ x: 300, y: 200 }, wide, box, 46), { x: 300, y: 200 });
    });

    it('lets a phone push it past the bottom, leaving its bar in sight, but never above the top', () => {
        assert.deepEqual(clampPlace({ x: 8, y: 5000 }, phone, box, 46), { x: 8, y: 780 - KEEP });
        assert.equal(clampPlace({ x: 8, y: -40 }, phone, box, 46).y, 0);
    });

    it('lets a phone push it sideways, leaving KEEP px of it in sight', () => {
        assert.equal(clampPlace({ x: -5000, y: 100 }, phone, box, 46).x, KEEP - 384);
        assert.equal(clampPlace({ x: 5000, y: 100 }, phone, box, 46).x, 390 - KEEP);
    });

    it('keeps a taller handle in sight', () => {
        assert.equal(clampPlace({ x: 0, y: 5000 }, phone, box, 80).y, 780 - 80);
    });
});

describe('defaultPlace', () => {
    it('is the top right of a wide screen, under the bar', () => {
        assert.deepEqual(defaultPlace(wide, box), { x: 1280 - 384 - 16, y: 120 });
    });

    it('is the bottom right of a phone, above the app\'s own bar, and always reachable', () => {
        const place = defaultPlace(phone, { width: 374, height: 260 });
        assert.equal(place.x, 390 - 374 - 8);
        assert.equal(place.y, 780 - 260 - 76);
    });
});
