import type { SyncState } from './app.ts';
import { h } from './dom.ts';
import { swipeAxis } from './swipe.ts';

/**
 * Pull down to sync: with the screen at its top, dragging the finger down and letting go syncs
 * now, instead of waiting for the next automatic sync (when the app comes back to the front, when
 * the network returns, every five minutes while it is open). The maths and the words are pure and
 * tested; `createPullToRefresh` does the touching.
 */

/** How far (px) the screen follows the finger at most */
export const PULL_MAX = 96;

/** How far (px) the screen has to be drawn down for letting go to count as "sync" */
export const PULL_TRIGGER = 64;

/** The screen follows the finger only this much, so it feels heavy and a stray drag does not arm it */
const RESISTANCE = 0.5;

/** How far (px) the screen rests while the sync runs and its answer is read */
const PULL_HOLD = 56;

/** The sync's answer stays this long (ms) so it can be read, and so a quick one does not flash */
const MIN_BUSY = 600;
const READ_FOR = 1200;

/** How far (px) the screen is drawn down while the finger is `dy` below where it started */
export function pullOffset(dy: number): number {
    return Math.min(PULL_MAX, Math.max(0, dy) * RESISTANCE);
}

/** Whether letting go now syncs */
export function pullArmed(dy: number): boolean {
    return pullOffset(dy) >= PULL_TRIGGER;
}

/** Whether a touch that has moved `dx`, `dy` is a pull down (a sideways or an upward move is not) */
export function isPull(dx: number, dy: number): boolean {
    return swipeAxis(dx, dy) === 'y' && dy > 0;
}

/** The pull starts only in the top part of the screen (this fraction of its height): a drag from lower down is a scroll */
export const PULL_ZONE = 1 / 3;

/** Whether a touch at `y` starts in the top part of a screen that begins at `top` and is `height` tall */
export function inPullZone(y: number, top: number, height: number): boolean {
    return y >= top && y - top <= height * PULL_ZONE;
}

/**
 * Whether `target` or anything between it and `container` is scrolled away from its top. The screen is often not
 * what scrolls (a song's stage scrolls inside it): its own `scrollTop` stays 0 while the person is at the bottom.
 */
export function scrolledWithin(target: Element | null, container: Element): boolean {
    for (let node = target; node !== null; node = node.parentElement) {
        if (node.scrollTop > 0) {
            return true;
        }
        if (node === container) {
            break;
        }
    }

    return false;
}

/** What the person reads while pulling */
export function pullHint(dy: number): string {
    return pullArmed(dy) ? 'Suelta para sincronizar' : 'Jala para sincronizar';
}

/** What the person reads once the sync is over */
export function pullAnswer(state: SyncState): string {
    switch (state) {
        case 'offline':
            return 'Sin conexión';
        case 'signed-out':
            return 'La sesión terminó';
        case 'error':
            return 'No se pudo sincronizar';
        default:
            return 'Sincronizado';
    }
}

export interface PullSource {
    /** Whether a pull may start on the screen being shown (not while singing, which has its own touches) */
    enabled(): boolean;
    /** Syncs now and says how it ended */
    refresh(): Promise<SyncState>;
}

/** Touches that belong to something else: typing, choosing, a sheet that scrolls on its own */
const OWN_TOUCH = 'input, textarea, select, [contenteditable], dialog, [role="dialog"], .sheet';

/**
 * Makes `container` (the scrolling screen) answer a pull down. Returns the strip that shows the
 * hint and the answer above the screen; the caller puts it in the page next to the container.
 */
export function createPullToRefresh(container: HTMLElement, source: PullSource): HTMLElement {
    const spinner = h('span', { class: 'pull__spinner', 'aria-hidden': 'true' });
    const label = h('span', { class: 'pull__label' });
    const strip = h('div', { class: 'pull', role: 'status', 'aria-live': 'polite', hidden: true }, h('span', { class: 'pull__pill' }, spinner, label));

    /** Where the finger started, or null when no pull is being tracked */
    let origin: { x: number; y: number } | null = null;
    let dragging = false;
    let busy = false;
    /** What the finger touched first: where to look for something already scrolled */
    let touched: Element | null = null;

    /** Draws the screen `offset` px down and opens the strip in the gap above it */
    const place = (offset: number): void => {
        container.style.transform = offset === 0 ? '' : `translateY(${offset}px)`;
        strip.style.height = `${offset}px`;
    };
    const moving = (on: boolean): void => {
        container.classList.toggle('is-pulling', on);
        strip.classList.toggle('is-pulling', on);
    };
    const close = (): void => {
        moving(false);
        place(0);
        setTimeout(() => {
            if (!busy && !dragging) {
                strip.hidden = true;
            }
        }, 250);
    };

    const run = async (): Promise<void> => {
        busy = true;
        strip.classList.add('is-busy');
        label.textContent = 'Sincronizando…';
        place(PULL_HOLD);
        const started = Date.now();
        const state = await source.refresh();
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_BUSY - (Date.now() - started))));
        strip.classList.remove('is-busy');
        label.textContent = pullAnswer(state);
        await new Promise((resolve) => setTimeout(resolve, READ_FOR));
        busy = false;
        close();
    };

    container.addEventListener('touchstart', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const [touch] = Array.from(event.touches);
        const lone = event.touches.length === 1 && touch !== undefined;
        const bounds = container.getBoundingClientRect();
        touched = target;
        origin = !busy && lone && !scrolledWithin(target ?? container, container) && source.enabled() && target?.closest(OWN_TOUCH) === null
            && inPullZone(touch.clientY, bounds.top, bounds.height)
            ? { x: touch.clientX, y: touch.clientY }
            : null;
        dragging = false;
    }, { passive: true });

    // Not passive: once the move is a pull down, the browser must not scroll or stretch the page too
    container.addEventListener('touchmove', (event) => {
        const [touch] = Array.from(event.touches);
        if (origin === null || touch === undefined) {
            return;
        }
        const dx = touch.clientX - origin.x;
        const dy = touch.clientY - origin.y;
        if (!dragging) {
            if (swipeAxis(dx, dy) === null) {
                return;
            }
            if (!isPull(dx, dy) || scrolledWithin(touched ?? container, container)) {
                // Sideways, upward or a scroll that already began: this touch is not ours
                origin = null;

                return;
            }
            dragging = true;
            // Read before the screen is moved: the strip sits where the screen began
            strip.style.top = `${container.getBoundingClientRect().top}px`;
            strip.hidden = false;
            moving(true);
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        label.textContent = pullHint(dy);
        strip.classList.toggle('is-armed', pullArmed(dy));
        place(pullOffset(dy));
    }, { passive: false });

    const release = (event: TouchEvent, cancelled: boolean): void => {
        const wasDragging = dragging;
        const [touch] = Array.from(event.changedTouches);
        const dy = origin !== null && touch !== undefined ? touch.clientY - origin.y : 0;
        origin = null;
        dragging = false;
        if (!wasDragging) {
            return;
        }
        strip.classList.remove('is-armed');
        moving(false);
        if (!cancelled && pullArmed(dy)) {
            void run();
        } else {
            close();
        }
    };
    container.addEventListener('touchend', (event) => release(event, false));
    container.addEventListener('touchcancel', (event) => release(event, true));

    return strip;
}
