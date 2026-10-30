import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expiryAfter, TodayKeys, type KeyStorage } from '../src/today-keys.ts';

const memoryStorage = (): KeyStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();

    return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

/** 2026-10-29 at the given local hour */
const at = (hour: number, minute = 0): number => new Date(2026, 9, 29, hour, minute).getTime();

describe('expiryAfter', () => {
    it('is 5 in the morning of the next day for an evening', () => {
        assert.equal(expiryAfter(at(19)), new Date(2026, 9, 30, 5).getTime());
    });

    it('is 5 in the morning of the same day for the small hours (a night Mass)', () => {
        assert.equal(expiryAfter(at(1)), at(5));
    });

    it('is the next day when it is exactly 5', () => {
        assert.equal(expiryAfter(at(5)), new Date(2026, 9, 30, 5).getTime());
    });
});

describe('TodayKeys', () => {
    it('remembers a key per item and tells the list apart', () => {
        const keys = new TodayKeys(memoryStorage(), () => at(10));
        keys.set('list-1', 'a', 2);
        keys.set('list-1', 'b', -3);
        keys.set('list-2', 'a', 5);

        assert.equal(keys.get('list-1', 'a'), 2);
        assert.equal(keys.get('list-2', 'a'), 5);
        assert.equal(keys.get('list-1', 'zzz'), null);
        assert.deepEqual([...keys.ofList('list-1')], [['a', 2], ['b', -3]]);
    });

    it('is shared by whoever reads the same storage (a reload)', () => {
        const storage = memoryStorage();
        new TodayKeys(storage, () => at(10)).set('l', 'i', 1);

        assert.equal(new TodayKeys(storage, () => at(11)).get('l', 'i'), 1);
    });

    it('forgets a key the next morning', () => {
        const storage = memoryStorage();
        new TodayKeys(storage, () => at(22)).set('l', 'i', 1);

        assert.equal(new TodayKeys(storage, () => at(23, 59)).get('l', 'i'), 1);
        assert.equal(new TodayKeys(storage, () => new Date(2026, 9, 30, 5, 1).getTime()).get('l', 'i'), null);
    });

    it('does not extend the day when the key changes again', () => {
        const storage = memoryStorage();
        let now = at(22);
        const keys = new TodayKeys(storage, () => now);
        keys.set('l', 'i', 1);
        now = at(23);
        keys.set('l', 'i', 2);
        now = new Date(2026, 9, 30, 5, 1).getTime();

        assert.equal(keys.get('l', 'i'), null);
    });

    it('clears one key and leaves the others', () => {
        const keys = new TodayKeys(memoryStorage(), () => at(10));
        keys.set('l', 'a', 1);
        keys.set('l', 'b', 2);
        keys.clear('l', 'a');

        assert.equal(keys.get('l', 'a'), null);
        assert.equal(keys.get('l', 'b'), 2);
    });

    it('ignores damaged storage', () => {
        const storage = memoryStorage();
        storage.setItem('lista:tono-hoy', '{not json');
        assert.equal(new TodayKeys(storage, () => at(10)).get('l', 'i'), null);

        storage.setItem('lista:tono-hoy', JSON.stringify({ 'l/i': { shift: 99, until: at(23) }, 'l/j': { shift: 1 } }));
        assert.equal(new TodayKeys(storage, () => at(10)).get('l', 'i'), null);
        assert.equal(new TodayKeys(storage, () => at(10)).get('l', 'j'), null);
    });

    it('works for this visit when storage refuses', () => {
        const refusing: KeyStorage = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
        };
        const keys = new TodayKeys(refusing, () => at(10));
        keys.set('l', 'i', 3);

        assert.equal(keys.get('l', 'i'), 3);
        assert.equal(new TodayKeys(null, () => at(10)).get('l', 'i'), null);
    });
});
