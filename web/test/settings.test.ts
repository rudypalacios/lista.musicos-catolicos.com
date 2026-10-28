import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readColumns, readMode } from '../src/prefs.ts';
import { LYRIC_COLORS } from '../src/settings.ts';

/** WCAG relative luminance of a #rrggbb colour */
function luminance(hex: string): number {
    const channel = (offset: number): number => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

describe('lyric colours', () => {
    it('have unique ids, and the first is the default (no colour of its own)', () => {
        assert.equal(new Set(LYRIC_COLORS.map((color) => color.id)).size, LYRIC_COLORS.length);
        assert.equal(LYRIC_COLORS[0]?.value, null);
    });

    it('all read well on the dark background of the app (contrast 7:1, AAA)', () => {
        const background = luminance('#101216');
        for (const color of LYRIC_COLORS) {
            if (color.value === null) {
                continue;
            }
            const ratio = (luminance(color.value) + 0.05) / (background + 0.05);
            assert.ok(ratio >= 7, `${color.id} has contrast ${ratio.toFixed(1)}`);
        }
    });
});

describe('preferences with no storage (node has none)', () => {
    it('fall back to the defaults: automatic columns, event mode', () => {
        assert.equal(readColumns(), 'auto');
        assert.equal(readMode(), 'event');
    });
});
