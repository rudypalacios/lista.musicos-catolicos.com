/**
 * The port of PrintLayout.php against the PHP itself: golden.json holds what it answered for
 * every song of the print corpus under every heading (scripts/fixtures). A difference here is
 * a sheet that fits the page on the public site and not here, or the other way round.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from '../../src/chordpro/parser.ts';
import { printHeight, printLayout, type PrintLayoutName, type PrintVersion } from '../../src/print/layout.ts';

interface Golden {
    printHeadings: [string, string][];
    print: {
        name: string;
        input: string;
        versions: Record<PrintVersion, {
            height: number;
            compactHeight: number;
            columnHeight: number;
            layouts: PrintLayoutName[];
        }>;
    }[];
}

const golden = JSON.parse(
    readFileSync(new URL('../fixtures/golden.json', import.meta.url), 'utf8'),
) as Golden;

describe('golden fixtures: print cascade', () => {
    for (const row of golden.print) {
        const sheet = parse(row.input);
        for (const version of ['chords', 'lyrics'] as const) {
            const expected = row.versions[version];
            it(`estimates the height of "${row.name}" (${version}) as PrintLayout.php does`, () => {
                // Same operations in the same order on doubles: equal to the last bit, no tolerance
                assert.equal(printHeight(sheet, version), expected.height);
                assert.equal(printHeight(sheet, version, 'compact'), expected.compactHeight);
                assert.equal(printHeight(sheet, version, 'compact', true), expected.columnHeight);
            });

            it(`chooses the layout of "${row.name}" (${version}) as PrintLayout.php does`, () => {
                golden.printHeadings.forEach(([title, subtitle], index) => {
                    assert.equal(printLayout(sheet, version, title, subtitle), expected.layouts[index], `heading ${index}`);
                });
            });
        }
    }

    it('reaches every layout in both versions, so a threshold cannot drift unseen', () => {
        for (const version of ['chords', 'lyrics'] as const) {
            const seen = new Set(golden.print.flatMap((row) => row.versions[version].layouts));
            assert.deepEqual([...seen].sort(), ['columns', 'compact', 'normal', 'pages']);
        }
    });

    it('lets a long heading push a sheet to a tighter layout', () => {
        const rank = ['normal', 'compact', 'columns', 'pages'];
        const moved = golden.print.some((row) => {
            const { layouts } = row.versions.chords;
            return rank.indexOf(layouts[3] as string) > rank.indexOf(layouts[0] as string);
        });
        assert.ok(moved);
    });
});
