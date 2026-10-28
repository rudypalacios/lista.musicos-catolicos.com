/**
 * When the bar over the lyrics folds to a strip while singing: scrolling down folds it, scrolling
 * up (or being back at the top) brings it back. Pure, so the thresholds are tested; perform.ts
 * feeds it the scroll position.
 */

/** A move of more than this (px) counts as scrolling, not as the page settling */
export const FOLD_MOVE = 12;

/** Not before the lyrics are this far (px) from the top: a bar folding at the first touch is jumpy */
export const FOLD_AFTER = 60;

export interface FoldState {
    folded: boolean;
    /** The scroll position the next move is measured from */
    anchor: number;
}

/**
 * @param state what was decided at the last significant move
 * @param top the lyrics' scroll position now
 */
export function nextFold(state: FoldState, top: number): FoldState {
    const moved = top - state.anchor;
    if (moved > FOLD_MOVE && top > FOLD_AFTER) {
        return { folded: true, anchor: top };
    }
    if (moved < -FOLD_MOVE || top <= 0) {
        return { folded: false, anchor: top };
    }

    return state;
}
