import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readColumns } from '../src/prefs.ts';
import { chosenReadingColors, READING_COLORS } from '../src/settings.ts';

/** WCAG relative luminance of a #rrggbb colour */
function luminance(hex: string): number {
    const channel = (offset: number): number => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio (WCAG) of two #rrggbb colours */
function contrast(a: string, b: string): number {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];

    return (light + 0.05) / (dark + 0.05);
}

/** The app's own colours, which a pair without a colour of its own falls back to (styles.css) */
const APP = { background: '#101216', text: '#eceff4', chords: '#6cb8ff' };

describe('reading colours', () => {
    it('have unique ids, and the first is the default (no colours of its own)', () => {
        assert.equal(new Set(READING_COLORS.map((colors) => colors.id)).size, READING_COLORS.length);
        assert.equal(READING_COLORS[0]?.lyrics, null);
        assert.equal(READING_COLORS[0]?.chords, null);
    });

    it('keep the ids the lyric colour had, so a colour chosen before the pairs keeps its lyrics', () => {
        for (const id of ['predeterminado', 'blanco', 'ambar']) {
            assert.ok(READING_COLORS.some((colors) => colors.id === id), id);
        }
    });

    it('read well on the dark background of the app, lyrics and chords alike (contrast 7:1, AAA)', () => {
        for (const colors of READING_COLORS) {
            const lyrics = contrast(colors.lyrics ?? APP.text, APP.background);
            const chords = contrast(colors.chords ?? APP.chords, APP.background);
            assert.ok(lyrics >= 7, `${colors.id}: lyrics have contrast ${lyrics.toFixed(1)}`);
            assert.ok(chords >= 7, `${colors.id}: chords have contrast ${chords.toFixed(1)}`);
        }
    });

    it('never give the chords the colour of the lyrics', () => {
        for (const colors of READING_COLORS) {
            assert.notEqual((colors.lyrics ?? APP.text).toLowerCase(), (colors.chords ?? APP.chords).toLowerCase(), colors.id);
        }
    });

    it('fall back to the default pair for an id that does not exist (nothing stored in node)', () => {
        assert.equal(chosenReadingColors().id, 'predeterminado');
    });
});

describe('preferences with no storage (node has none)', () => {
    it('fall back to the defaults: automatic columns', () => {
        assert.equal(readColumns(), 'auto');
    });
});
