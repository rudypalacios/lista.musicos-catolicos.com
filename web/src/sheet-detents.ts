/**
 * Where a bottom sheet comes to rest after the finger lets go of its handle. A sheet rests at levels (expanded, low, closed); the
 * handle drags it anywhere between them, and on release it goes to the level nearest to where it was heading, counting how fast the
 * gesture was, so a quick flick goes further than a slow drag of the same length. Pure, so it is tested without a screen.
 */

/** Where the sheet rests: all of its details in view, only its head and the notes, or gone */
export type Level = 'expanded' | 'low' | 'closed';

/** A level and how far down the sheet sits at it, in px (0 is the most it opens) */
export type LevelAt = readonly [Level, number];

/** A point of a gesture: the clock (ms) and the finger's vertical position (px) */
export interface Sample {
    time: number;
    y: number;
}

/** How far ahead (ms) the sheet's speed is counted, to guess where a flick was heading */
const LOOKAHEAD = 180;

/**
 * The levels a sheet has: `lowOffset` is how far down it sits when low (0 when it has nothing to expand into: then it has no
 * "expanded" and "low" is its only open level), `height` how far down it is when closed.
 */
export function levelsOf(lowOffset: number, height: number): LevelAt[] {
    return lowOffset > 0 ? [['expanded', 0], ['low', lowOffset], ['closed', height]] : [['low', 0], ['closed', height]];
}

/** Speed of the finger in px per ms, down positive, over the samples given (the last ones of the gesture); 0 for one point or none */
export function velocityOf(samples: readonly Sample[]): number {
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (first === undefined || last === undefined || last.time <= first.time) {
        return 0;
    }

    return (last.y - first.y) / (last.time - first.time);
}

/** The level a release at `position` (px down) with `velocity` (px per ms, down positive) goes to */
export function pickLevel(position: number, velocity: number, levels: readonly LevelAt[]): Level {
    const heading = position + velocity * LOOKAHEAD;
    let best = levels[0];
    for (const level of levels) {
        if (best === undefined || Math.abs(level[1] - heading) < Math.abs(best[1] - heading)) {
            best = level;
        }
    }

    return best?.[0] ?? 'low';
}
