/**
 * Moving a song inside its section by holding it: a long press lifts the row, the finger (or the mouse) moves it up
 * and down among the rows of its own section, a line shows where it will land, and letting go drops it there. A touch
 * that moves before the press is long is a scroll, and a short touch is a touch: it still sings the song.
 *
 * Only the order inside the section is moved here. The arrows and "al inicio" / "al final" in the song's sheet do the
 * same without dragging (an alternative for whoever cannot or does not want to hold and drag).
 */

/** How long the press is held before the row lifts (ms) */
export const HOLD_TIME = 450;
/** How far a touch may wander (px) before it is a scroll and not a press */
const SLOP = 10;
/** How near the top or bottom of the screen (px) the dragging scrolls it, and how fast (px per frame) */
const EDGE = 64;
const SCROLL_STEP = 12;
/** How long after a drop (ms) the click that follows it is ignored: dropping must not sing the song */
const CLICK_GUARD = 400;

/**
 * Where a dragged song lands: the number of the other rows whose centre is above the pointer. `0` is before all of
 * them, `centres.length` after all of them. The centres are those of the rows that are not being dragged, in order.
 */
export function dropIndex(centres: readonly number[], pointerY: number): number {
    return centres.filter((centre) => centre < pointerY).length;
}

export interface LongPressDrag {
    /** Whether a drag ended a moment ago: the click that comes with it must not be taken as a touch on the song */
    justDragged(): boolean;
    /** Whether a song is lifted now: the screen must not be redrawn under it (a sync can arrive meanwhile) */
    active(): boolean;
    dispose(): void;
}

export interface LongPressDragOptions {
    /** What is pressed (the song's button) */
    handle: HTMLElement;
    /** Its row, which lifts. The rows of its section are the children of the row's parent that are rows (`rowClass`) */
    row: HTMLElement;
    rowClass: string;
    /** The screen that scrolls, to follow the finger at the edges */
    scroller: () => HTMLElement | null;
    /** The place the song was dropped at, counted among the others (`dropIndex`); not called when it did not change */
    onDrop: (to: number) => void;
    /** Called when the drag ends, dropped or not: whoever held back a redraw can make it now */
    onEnd?: () => void;
}

export function attachLongPressDrag(options: LongPressDragOptions): LongPressDrag {
    const { handle, row } = options;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pointer = -1;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let dragging = false;
    let endedAt = 0;
    let frame = 0;
    // What is measured when the drag starts, in the coordinates of the scrolled content, so scrolling does not move it
    let others: HTMLElement[] = [];
    let centres: number[] = [];
    let from = 0;
    let startContentY = 0;
    let listTop = 0;
    let edges: number[] = [];
    let line: HTMLElement | null = null;
    let list: HTMLElement | null = null;

    const contentY = (clientY: number): number => {
        const scroller = options.scroller();

        return scroller === null ? clientY : clientY - scroller.getBoundingClientRect().top + scroller.scrollTop;
    };

    const cancelTimer = (): void => {
        clearTimeout(timer);
        timer = undefined;
    };

    /**
     * The move, the release and the cancel are heard on the document while a press lasts: a mouse that leaves the song
     * sends them to whatever it is over (a finger keeps them on the song, a mouse does not)
     */
    const listen = (): void => {
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onCancel);
    };
    const unlisten = (): void => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onCancel);
    };

    const update = (): void => {
        if (!dragging) {
            return;
        }
        const here = contentY(lastY);
        row.style.transform = `translateY(${here - startContentY}px)`;
        const to = dropIndex(centres, here);
        if (line !== null) {
            line.style.top = `${edges[to] ?? 0}px`;
        }
    };

    const follow = (): void => {
        if (!dragging) {
            return;
        }
        const scroller = options.scroller();
        if (scroller !== null) {
            const box = scroller.getBoundingClientRect();
            if (lastY < box.top + EDGE) {
                scroller.scrollTop -= SCROLL_STEP;
            } else if (lastY > box.bottom - EDGE) {
                scroller.scrollTop += SCROLL_STEP;
            }
        }
        update();
        frame = requestAnimationFrame(follow);
    };

    const start = (): void => {
        timer = undefined;
        list = row.parentElement;
        if (!handle.isConnected || list === null) {
            return;
        }
        const rows = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains(options.rowClass));
        from = rows.indexOf(row);
        if (rows.length < 2 || from === -1) {
            return;
        }
        others = rows.filter((candidate) => candidate !== row);
        const scroller = options.scroller();
        const scrolled = scroller === null ? 0 : scroller.scrollTop - scroller.getBoundingClientRect().top;
        const listBox = list.getBoundingClientRect();
        listTop = listBox.top;
        // Centres in the content's coordinates; the lines in the list's (a line is drawn inside the list)
        centres = others.map((other) => {
            const box = other.getBoundingClientRect();

            return box.top + box.height / 2 + scrolled;
        });
        edges = [];
        others.forEach((other, index) => {
            const box = other.getBoundingClientRect();
            if (index === 0) {
                edges.push(box.top - listTop);
            }
            edges.push(box.bottom - listTop);
        });
        startContentY = contentY(startY);
        dragging = true;
        row.classList.add('is-lifted');
        list.classList.add('is-dragging');
        line = document.createElement('div');
        line.className = 'drag-line';
        line.setAttribute('aria-hidden', 'true');
        list.append(line);
        try {
            handle.setPointerCapture(pointer);
        } catch {
            // The pointer is gone already: the drag ends with it
        }
        try {
            // A small tick where the device has one, so the lift is felt
            navigator.vibrate(15);
        } catch {
            // No vibration: nothing to feel, the row is lifted all the same
        }
        update();
        frame = requestAnimationFrame(follow);
    };

    const finish = (drop: boolean): void => {
        cancelTimer();
        unlisten();
        if (!dragging) {
            return;
        }
        dragging = false;
        cancelAnimationFrame(frame);
        const to = dropIndex(centres, contentY(lastY));
        row.classList.remove('is-lifted');
        row.style.transform = '';
        list?.classList.remove('is-dragging');
        line?.remove();
        line = null;
        endedAt = Date.now();
        try {
            handle.releasePointerCapture(pointer);
        } catch {
            // Released with the pointer
        }
        if (drop && to !== from) {
            options.onDrop(to);
        }
        options.onEnd?.();
    };

    const onDown = (event: PointerEvent): void => {
        // The main button of a mouse, any touch or pen; a second finger is not a new press
        if (event.button !== 0 || dragging || timer !== undefined) {
            return;
        }
        pointer = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        lastY = event.clientY;
        timer = setTimeout(start, HOLD_TIME);
        listen();
    };
    const onMove = (event: PointerEvent): void => {
        if (event.pointerId !== pointer) {
            return;
        }
        lastY = event.clientY;
        if (!dragging && timer !== undefined && Math.hypot(event.clientX - startX, event.clientY - startY) > SLOP) {
            // It moved before the press was long: it is a scroll, not a drag
            cancelTimer();
            unlisten();
        } else if (dragging) {
            update();
        }
    };
    const onUp = (event: PointerEvent): void => {
        if (event.pointerId === pointer) {
            finish(true);
        }
    };
    const onCancel = (event: PointerEvent): void => {
        if (event.pointerId === pointer) {
            finish(false);
        }
    };
    // Once lifted, the screen must not scroll under the finger (it has not started to: the press was still)
    const onTouchMove = (event: TouchEvent): void => {
        if (dragging && event.cancelable) {
            event.preventDefault();
        }
    };
    // The menu a long press opens on some phones is of no use here, and would end the drag
    const onContextMenu = (event: Event): void => event.preventDefault();
    const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && dragging) {
            finish(false);
        }
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('touchmove', onTouchMove, { passive: false });
    handle.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKey);

    return {
        justDragged: () => Date.now() - endedAt < CLICK_GUARD,
        active: () => dragging,
        dispose: () => {
            finish(false);
            handle.removeEventListener('pointerdown', onDown);
            handle.removeEventListener('touchmove', onTouchMove);
            handle.removeEventListener('contextmenu', onContextMenu);
            document.removeEventListener('keydown', onKey);
        },
    };
}

/** The tip that a song can be held to be moved, said once on a device (a convenience kept in `localStorage`) */
const HINT_KEY = 'lista:drag-hint';

export function dragHintPending(): boolean {
    try {
        return localStorage.getItem(HINT_KEY) === null;
    } catch {
        // No storage: the tip would come every time; better none
        return false;
    }
}

export function markDragHintSeen(): void {
    try {
        localStorage.setItem(HINT_KEY, '1');
    } catch {
        // Nothing to do
    }
}
