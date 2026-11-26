/**
 * A page that was read once, when it opened, shows what a sync brings to the device only if it is drawn again. The lists listen to
 * `App.onData` and reload themselves; the pages that hold one record (a song, a list being sung) are built from it and cannot, so
 * they ask this: it compares what the page shows now with what it showed when it opened and, if it changed, goes to the same
 * address again (`replace`, so the history does not grow), which builds the page from the data of the device as it is.
 *
 * `read` says what the page shows, as text (`null` when it is gone); only a difference in that text draws the page again, so what
 * the person does on the page itself (their key) does not. A page that is busy (a player that is playing) is not drawn again
 * until `resume` is called, so a sync never cuts what the person is listening to.
 */
import type { App } from '../app.ts';
import type { Navigate } from './types.ts';

export interface Redraw {
    /** Stops listening (the page is gone) */
    stop: () => void;
    /** The page is no longer busy: draws it again if something changed while it was */
    resume: () => void;
    /** Draws the page again now, whatever it is doing (the person asked for what arrived) */
    now: () => void;
}

export function redrawOnChange(
    app: App,
    navigate: Navigate,
    read: () => Promise<string | null>,
    busy: () => boolean = () => false,
    /** Something changed but the page is busy: it can say so (the editor offers what arrived) */
    onWaiting: () => void = () => undefined,
): Redraw {
    // What the page shows as it opens: a change that arrives before this is known is compared with it, not lost
    const before = read().catch(() => null);
    let waiting = false;
    let gone = false;
    const redraw = (): void => {
        waiting = false;
        stop();
        navigate(`${location.pathname}${location.search}`, { replace: true });
    };
    const check = async (): Promise<void> => {
        const [was, now] = [await before, await read()];
        if (gone || was === null || now === null || now === was) {
            return;
        }
        if (busy()) {
            waiting = true;
            onWaiting();
        } else {
            redraw();
        }
    };
    const unsubscribe = app.onData(() => void check().catch(() => undefined));
    function stop(): void {
        gone = true;
        unsubscribe();
    }

    return {
        now: () => {
            if (!gone) {
                redraw();
            }
        },
        stop,
        resume: () => {
            if (waiting && !gone && !busy()) {
                redraw();
            }
        },
    };
}
