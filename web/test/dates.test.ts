import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidDate, longDate, shortDate, shortDay, today } from '../src/dates.ts';

describe('isValidDate', () => {
    it('accepts real calendar days', () => {
        for (const day of ['2026-11-01', '2024-02-29', '2000-02-29', '1999-12-31']) {
            assert.equal(isValidDate(day), true, day);
        }
    });

    it('refuses days that do not exist and other formats', () => {
        for (const day of ['2026-02-30', '2025-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-11-1', '01/11/2026', '', 'hoy', '2026-11-01T00:00', ' 2026-11-01']) {
            assert.equal(isValidDate(day), false, day);
        }
    });
});

describe('today', () => {
    it('is the day on this device, not the day in UTC', () => {
        // 23:30 local on the 1st: in UTC-5 that is already the 2nd in UTC
        assert.equal(today(new Date(2026, 10, 1, 23, 30)), '2026-11-01');
        assert.equal(today(new Date(2026, 10, 1, 0, 5)), '2026-11-01');
    });

    it('pads months and days', () => {
        assert.equal(today(new Date(2026, 0, 5, 12)), '2026-01-05');
    });
});

describe('long and short dates', () => {
    it('are written in Spanish and do not move with the time zone', () => {
        assert.equal(longDate('2026-11-01'), 'domingo, 1 de noviembre de 2026');
        assert.equal(shortDate('2026-11-01'), '1 de noviembre');
        assert.equal(shortDate('2026-12-25'), '25 de diciembre');
    });
});

describe('shortDay', () => {
    it('is the weekday, the day and the month, abbreviated', () => {
        assert.equal(shortDay('2026-11-01'), 'dom 1 nov');
        assert.equal(shortDay('2026-09-06'), 'dom 6 sep');
        assert.equal(shortDay('2026-12-31'), 'jue 31 dic');
    });
});
