/**
 * Two fingers on the lyrics: opening them makes the letters bigger, closing them smaller. The maths
 * is pure (tested without a touch screen); `watchPinch` does the touching.
 */

/**
 * How many steps (1px of lyrics each) a pinch is worth: the fingers went from `from` to `to` px apart
 * (positive = opened = bigger), and the letters, `fontPx` big, grow in the same proportion: the pinch
 * follows the fingers smoothly instead of jumping from one size to the next.
 */
export function pinchSteps(from: number, to: number, fontPx: number): number {
    if (!(from > 0) || !(to > 0) || !(fontPx > 0)) {
        return 0;
    }

    // `+ 0` turns the -0 that Math.round gives for a small closing into a plain 0
    return Math.round(fontPx * (to / from - 1)) + 0;
}

function distance(a: Touch, b: Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export interface PinchHandlers {
    /** Where the size is now, when a pinch starts */
    current: () => number;
    /** The size the pinch is at now: called only when it changes, as the fingers move */
    apply: (size: number) => void;
    /** How big the letters are (px) when the pinch starts */
    fontPx: () => number;
    /** Keeps the size inside what the caller allows */
    clamp: (size: number) => number;
}

/** Makes `target` answer to a two-finger pinch. Returns what stops it. */
export function watchPinch(target: HTMLElement, handlers: PinchHandlers): () => void {
    let from = 0;
    let base = 0;
    let last = 0;
    let fontPx = 0;
    const onStart = (event: TouchEvent): void => {
        const [a, b] = [event.touches[0], event.touches[1]];
        if (event.touches.length !== 2 || a === undefined || b === undefined) {
            from = 0;

            return;
        }
        from = distance(a, b);
        base = handlers.current();
        fontPx = handlers.fontPx();
        last = base;
    };
    const onMove = (event: TouchEvent): void => {
        const [a, b] = [event.touches[0], event.touches[1]];
        if (from === 0 || event.touches.length !== 2 || a === undefined || b === undefined) {
            return;
        }
        // The browser must not also zoom the page or scroll the song under the fingers
        event.preventDefault();
        const next = handlers.clamp(base + pinchSteps(from, distance(a, b), fontPx));
        if (next !== last) {
            last = next;
            handlers.apply(next);
        }
    };
    const onEnd = (event: TouchEvent): void => {
        if (event.touches.length < 2) {
            from = 0;
        }
    };
    // Safari draws its own page zoom from these unless they are stopped
    const stop = (event: Event): void => event.preventDefault();
    target.addEventListener('touchstart', onStart, { passive: true });
    target.addEventListener('touchmove', onMove, { passive: false });
    target.addEventListener('touchend', onEnd, { passive: true });
    target.addEventListener('touchcancel', onEnd, { passive: true });
    target.addEventListener('gesturestart', stop);
    target.addEventListener('gesturechange', stop);

    return () => {
        target.removeEventListener('touchstart', onStart);
        target.removeEventListener('touchmove', onMove);
        target.removeEventListener('touchend', onEnd);
        target.removeEventListener('touchcancel', onEnd);
        target.removeEventListener('gesturestart', stop);
        target.removeEventListener('gesturechange', stop);
    };
}
