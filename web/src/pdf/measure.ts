import type { Measure } from './layout.ts';

/**
 * The width of a letter, from the browser's own canvas. It is not the font of the sheet, and does not
 * need to be: layout.ts scales each line to the width the sheet gives it, so only the ratios
 * between letters count, and those are alike in all the sans-serif fonts a sheet uses.
 */
export function canvasMeasure(): Measure {
    const context = document.createElement('canvas').getContext('2d');
    const cache = new Map<string, number>();
    if (context !== null) {
        context.font = '100px sans-serif';
    }

    return (char, size) => {
        let ratio = cache.get(char);
        if (ratio === undefined) {
            ratio = context !== null ? context.measureText(char).width / 100 : 0.55;
            cache.set(char, ratio);
        }

        return ratio * size;
    };
}
