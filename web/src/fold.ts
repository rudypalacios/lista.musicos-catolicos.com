/**
 * When the bar over the lyrics folds to a strip while singing: scrolling down folds it, scrolling
 * up (or being back at the top) brings it back. Pure, so the thresholds are tested; perform.ts
 * feeds it the scroll position.
 */

/** A move of more than this (px) counts as scrolling, not as the page settling */
export const FOLD_MOVE = 12;

/** Not before the lyrics are this far (px) from the top: a bar folding at the first touch is jumpy */
export const FOLD_AFTER = 60;

/**
 * Singing folds the bar this many px before the first line of the lyrics would slide under it,
 * so the head of a section (its name tag) is never half hidden behind the bar
 */
export const FOLD_LEAD = 2;

/**
 * Where the singing bar must fold: the room between the bar and the first line (px), less the lead.
 * Never below 1, so a song resting at the top does not fold.
 */
export function foldBefore(gap: number): number {
    return Math.max(1, gap - FOLD_LEAD);
}

/** The room (rem) between a floating bar and the first line of the lyrics: the stage's padding less the bar's height, the same in singing and on the page of a shared list */
export const BAR_GAP_REM = 0.5;

/** Where (px of scroll) a floating bar folds in the browser's current text size: the one place both screens ask */
export function barFoldPoint(): number {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    return foldBefore(BAR_GAP_REM * rem);
}

export interface FoldState {
    folded: boolean;
    /** The scroll position the next move is measured from */
    anchor: number;
}

/**
 * @param state what was decided at the last significant move
 * @param top the lyrics' scroll position now
 * @param after the scroll position from which it may fold (default `FOLD_AFTER`); a smaller one
 *   also shortens the move that counts, so folding is not held back past it
 */
export function nextFold(state: FoldState, top: number, after: number = FOLD_AFTER): FoldState {
    const moved = top - state.anchor;
    if (moved > Math.min(FOLD_MOVE, after) && top > after) {
        return { folded: true, anchor: top };
    }
    if (moved < -FOLD_MOVE || top <= 0) {
        return { folded: false, anchor: top };
    }

    return state;
}
