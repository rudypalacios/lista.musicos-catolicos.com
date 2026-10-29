/** Where a bar is on screen, as `getBoundingClientRect` says */
export interface Bar {
    top: number;
    bottom: number;
}

/**
 * How far from the bottom of the window a message must sit to be above the bars stacked on it (the
 * menu on a phone, the install bar over it): the height of the stack. A bar that does not rest on the
 * stack (the rail of a wide screen, which fills the height at the side) or is not on screen does not count.
 */
export function liftAbove(bars: readonly Bar[], viewportHeight: number): number {
    const candidates = bars.filter((bar) => bar.bottom - bar.top > 0 && bar.bottom - bar.top <= viewportHeight / 2);
    let edge = viewportHeight;
    for (let found = true; found;) {
        const resting = candidates.find((bar) => Math.abs(bar.bottom - edge) <= 1 && bar.top < edge - 1);
        found = resting !== undefined;
        if (resting !== undefined) {
            edge = resting.top;
        }
    }

    return viewportHeight - edge;
}

/**
 * Keeps `--chrome-bottom` (on the root) as the height of what rests at the bottom of the app, so the
 * messages that float over the screen (saved, update) sit above the menu and the install bar instead
 * of covering them. It follows the bars as they show, hide or change size, and the window as it turns.
 */
export function watchBottomChrome(bars: readonly HTMLElement[]): void {
    const root = document.documentElement;
    const place = (): void => {
        const lift = liftAbove(bars.map((bar) => bar.getBoundingClientRect()), window.innerHeight);
        root.style.setProperty('--chrome-bottom', `${Math.ceil(lift)}px`);
    };
    const observer = new ResizeObserver(place);
    observer.observe(root);
    for (const bar of bars) {
        observer.observe(bar);
    }
    place();
}
