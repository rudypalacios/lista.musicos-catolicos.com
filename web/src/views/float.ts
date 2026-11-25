/**
 * Makes an element a window the person can move: it floats over the page (`position: fixed`), is dragged by its handle and
 * stays where it is left. It is what lets the player of a song sit wherever it bothers least, and lets the lyrics be touched and
 * scrolled while it is open (nothing sits behind it that closes it).
 *
 * - On a wide screen it stays whole inside the window.
 * - On a phone it may be pushed past an edge, leaving only its handle in sight: out of the way, but not closed.
 *
 * The place is a convenience of this device, kept in `localStorage` (never required: with no storage it starts at its default
 * place every time). Pure geometry (`clampPlace`, `defaultPlace`) is apart from the pointer code so it is tested.
 */

export interface Place {
    x: number;
    y: number;
}

export interface Size {
    width: number;
    height: number;
}

/** From this width the window is kept whole on screen; under it, it may leave and keep only its handle in sight */
export const WIDE = 900;

/** How much of a window pushed past an edge stays in sight (px): enough to find it and drag it back */
export const KEEP = 48;

/** The top of the window under the app's bar and the tools on a wide screen (px) */
const WIDE_TOP = 120;

/** The room left at the foot of a phone for the app's own bar (px) */
const PHONE_FOOT = 76;

/** Where the window goes the first time: top right on a wide screen (clear of the bar), bottom right of a phone */
export function defaultPlace(screen: Size, box: Size): Place {
    const wide = screen.width >= WIDE;
    const x = screen.width - box.width - (wide ? 16 : 8);

    return clampPlace({ x, y: wide ? WIDE_TOP : screen.height - box.height - PHONE_FOOT }, screen, box, 0);
}

/**
 * Keeps a place where the window can be: whole inside the screen on a wide one; on a phone it may go past an edge while `KEEP`
 * px of it (and always its handle, which is `handle` px tall at its top) stay in sight.
 */
export function clampPlace(place: Place, screen: Size, box: Size, handle: number): Place {
    if (screen.width >= WIDE) {
        return {
            x: Math.min(Math.max(place.x, 0), Math.max(screen.width - box.width, 0)),
            y: Math.min(Math.max(place.y, 0), Math.max(screen.height - box.height, 0)),
        };
    }

    return {
        x: Math.min(Math.max(place.x, KEEP - box.width), screen.width - KEEP),
        y: Math.min(Math.max(place.y, 0), Math.max(screen.height - Math.max(handle, KEEP), 0)),
    };
}

const STORE_KEY = 'lista.player.place';

/** The place this device remembers for the kind of screen it is on (wide or phone), if any */
function remembered(wide: boolean): Place | null {
    try {
        const stored = JSON.parse(localStorage.getItem(`${STORE_KEY}.${wide ? 'wide' : 'phone'}`) ?? 'null') as Partial<Place> | null;

        return stored !== null && Number.isFinite(stored.x) && Number.isFinite(stored.y) ? { x: Number(stored.x), y: Number(stored.y) } : null;
    } catch {
        return null;
    }
}

function remember(wide: boolean, place: Place): void {
    try {
        localStorage.setItem(`${STORE_KEY}.${wide ? 'wide' : 'phone'}`, JSON.stringify(place));
    } catch {
        // no storage: it starts at its default place next time
    }
}

export interface Floating {
    /** Puts it at its remembered place (or the default), kept inside the screen */
    place: () => void;
    /** Takes away what it listens to */
    dispose: () => void;
}

export interface FloatingOptions {
    /** Called the first time the person moves it */
    onMoved?: () => void;
}

/** Makes `element` float and drag by `handle` (what is on the handle that is a button or a link still works by touch) */
export function makeFloating(element: HTMLElement, handle: HTMLElement, options: FloatingOptions = {}): Floating {
    element.classList.add('is-float');
    handle.classList.add('is-handle');
    const screen = (): Size => ({ width: window.innerWidth, height: window.innerHeight });
    const box = (): Size => ({ width: element.offsetWidth, height: element.offsetHeight });
    const isWide = (): boolean => window.innerWidth >= WIDE;
    let current: Place = { x: 0, y: 0 };
    let moved = false;

    const apply = (next: Place): void => {
        current = clampPlace(next, screen(), box(), handle.offsetHeight);
        element.style.left = `${current.x}px`;
        element.style.top = `${current.y}px`;
    };
    const place = (): void => apply(remembered(isWide()) ?? defaultPlace(screen(), box()));

    let start: { pointer: number; x: number; y: number; from: Place } | null = null;
    handle.addEventListener('pointerdown', (event) => {
        if ((event.target as HTMLElement).closest('button, a') !== null || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
        }
        start = { pointer: event.pointerId, x: event.clientX, y: event.clientY, from: current };
        handle.setPointerCapture(event.pointerId);
        element.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', (event) => {
        if (start === null || event.pointerId !== start.pointer) {
            return;
        }
        apply({ x: start.from.x + event.clientX - start.x, y: start.from.y + event.clientY - start.y });
        if (!moved) {
            moved = true;
            options.onMoved?.();
        }
    });
    const drop = (event: PointerEvent): void => {
        if (start === null || event.pointerId !== start.pointer) {
            return;
        }
        start = null;
        element.classList.remove('is-dragging');
        remember(isWide(), current);
    };
    handle.addEventListener('pointerup', drop);
    handle.addEventListener('pointercancel', drop);
    // The screen turned or changed size: keep it where it can be reached
    const keep = (): void => apply(current);
    window.addEventListener('resize', keep);

    return { place, dispose: () => window.removeEventListener('resize', keep) };
}
