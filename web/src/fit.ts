/**
 * "Ajustar a la pantalla": the biggest lyric size at which a whole song fits the screen, so it
 * can be read from the first line to the last without scrolling or zooming. Many songs are
 * short, so they come out big; a long one shrinks, down to a readable minimum, then goes into
 * two columns (wide screens) and only then scrolls.
 */

export interface FitLimits {
    /** px: never smaller than this (readable at arm's length on a stand) */
    min: number;
    /** px: never bigger than this (a four-line song must not look absurd) */
    max: number;
    /** px: the resolution of the search */
    step: number;
}

export interface FitResult {
    size: number;
    /** Whether the song fits at `size`. False only when even `min` is too big. */
    fits: boolean;
}

/**
 * The largest size in [min, max] (a multiple of `step` from min) for which `fits` is true,
 * assuming that if a size fits, every smaller one does too. Binary search: a dozen
 * measurements, not hundreds.
 */
export function bestSize(limits: FitLimits, fits: (size: number) => boolean): FitResult {
    const { min, max, step } = limits;
    if (!fits(min)) {
        return { size: min, fits: false };
    }
    if (fits(max)) {
        return { size: max, fits: true };
    }
    let low = 0; // steps above `min` known to fit
    let high = Math.floor((max - min) / step); // steps above `min` known not to fit (or the cap)
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (fits(min + middle * step)) {
            low = middle;
        } else {
            high = middle;
        }
    }

    return { size: min + low * step, fits: true };
}

export type FitLayout = 'one-column' | 'two-columns' | 'scroll';

/** How many columns the person wants on a wide screen: as many as the song needs, or always one / two */
export type ColumnMode = 'auto' | 'one' | 'two';

export const DEFAULT_LIMITS: FitLimits = { min: 13, max: 34, step: 0.5 };

/** Below this width two columns are not worth it: phones scroll instead */
export const TWO_COLUMNS_MIN_WIDTH = 720;

/** Whether the stage is wide enough for two columns */
export function isWide(stage: HTMLElement): boolean {
    return stage.clientWidth >= TWO_COLUMNS_MIN_WIDTH;
}

/**
 * Fits `content` (the song, in a stage with a fixed size) by setting `--lyric-size` on it.
 * With `columns` "auto": tries one column; if the minimum size does not fit and the stage is
 * wide, two columns; if that does not fit either, a single column at the minimum, which
 * scrolls. "one" never uses two columns; "two" tries them first (a narrow stage has no room
 * for them and stays in one).
 *
 * @returns the layout it settled on and the size it chose
 */
export function fitToStage(
    stage: HTMLElement,
    content: HTMLElement,
    limits: FitLimits = DEFAULT_LIMITS,
    columns: ColumnMode = 'auto',
): { layout: FitLayout; size: number } {
    const apply = (size: number): void => content.style.setProperty('--lyric-size', `${size}px`);
    const overflows = (inColumns: boolean): boolean =>
        inColumns
            ? content.scrollWidth > stage.clientWidth + 1 || content.scrollHeight > stage.clientHeight + 1
            : content.scrollHeight > stage.clientHeight + 1 || content.scrollWidth > stage.clientWidth + 1;
    const attempt = (inColumns: boolean): FitResult => {
        content.classList.toggle('is-columns', inColumns);

        return bestSize(limits, (size) => {
            apply(size);

            return !overflows(inColumns);
        });
    };
    const wide = isWide(stage);

    if (columns !== 'two' || !wide) {
        const single = attempt(false);
        if (single.fits) {
            apply(single.size);
            content.classList.remove('is-scroll');

            return { layout: 'one-column', size: single.size };
        }
    }
    if (columns !== 'one' && wide) {
        const double = attempt(true);
        if (double.fits) {
            apply(double.size);
            content.classList.remove('is-scroll');

            return { layout: 'two-columns', size: double.size };
        }
    }

    content.classList.remove('is-columns');
    content.classList.add('is-scroll');
    apply(limits.min);

    return { layout: 'scroll', size: limits.min };
}

/** Leaves fit mode: the manual size (A− / A+) takes over again */
export function clearFit(content: HTMLElement): void {
    content.classList.remove('is-columns', 'is-scroll');
    content.style.removeProperty('--lyric-size');
}
