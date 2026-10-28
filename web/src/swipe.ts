/**
 * The maths of dragging a song sideways: which way a touch is going, how far the page follows the
 * finger and whether letting go counts as "next" or "previous". Pure, so it is tested without a
 * touch screen; perform.ts does the touching.
 */

/** A swipe is a mostly horizontal move at least this far (px) */
export const SWIPE_MIN = 60;

/** The finger has to move this far (px) before it is clear whether it scrolls or swipes */
export const AXIS_LOCK = 10;

/** At the first or the last song the page follows the finger only this much, so it feels held back */
const RESISTANCE = 0.25;

/** A swipe has to be this much more horizontal than vertical (a slanted scroll is not a swipe) */
const HORIZONTAL_BIAS = 1.5;

export type Axis = 'x' | 'y';

/** What the finger is doing so far: null while it has not moved enough to tell */
export function swipeAxis(dx: number, dy: number): Axis | null {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) {
        return null;
    }

    return Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS ? 'x' : 'y';
}

/** Whether a touch that moved `dx`, `dy` is a swipe to change song */
export function isSwipe(dx: number, dy: number): boolean {
    return Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS;
}

/**
 * How far (px) the page is drawn from its place while the finger is `dx` away from where it started.
 *
 * @param available whether there is a song on the side the finger pulls towards
 */
export function dragOffset(dx: number, available: boolean): number {
    return available ? dx : dx * RESISTANCE;
}
