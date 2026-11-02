import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';

/** The sheets that are open now, last one on top: the back button closes the top one */
const opened: Array<{ closeFromBack: () => void }> = [];

/** What to do once each `history.back()` we made ourselves has landed (their popstates are not the person's) */
const ownBacks: Array<(() => void) | undefined> = [];

/**
 * To be called first thing on every `popstate`. An open sheet holds a history entry of its own, so
 * the Android back button closes it instead of leaving the screen; this is what closes it.
 *
 * @returns true when the event was about a sheet (closed by the back button, or the entry one
 *     closed by hand gave back) and the router must leave the screen alone
 */
export function dismissSheetOnBack(): boolean {
    if (ownBacks.length > 0) {
        ownBacks.shift()?.();

        return true;
    }
    const top = opened.at(-1);
    if (top === undefined) {
        return false;
    }
    top.closeFromBack();

    return true;
}

/** From this width a screen has room for a menu beside its button (the same width at which the app's own menu goes to the left) */
const WIDE = '(min-width: 900px)';
/** The space kept between an anchored menu and the button, and the edges of the window (px: it is a measure of the window, not of the design) */
const GAP = 8;
const EDGE = 16;

export interface SheetOptions {
    /**
     * On a wide screen the sheet is a menu beside the button that opened it (below it, or above when there is no
     * room), and the rest of the screen stays still. On a phone it is the sheet from the bottom, as always.
     */
    anchored?: boolean;
}

export interface Sheet {
    /** The panel; its scrim comes with it. Put it inside the screen it covers (a positioned element). */
    element: HTMLElement;
    /** Where the content goes */
    body: HTMLElement;
    /** `trigger` is the button that asks for it: an anchored sheet opens beside it (without one it keeps the last place) */
    open: (trigger?: Element | Event) => void;
    /**
     * Closes it (and gives back the history entry it took). `then` runs once that is done, which is
     * when it is safe to navigate: going somewhere before would leave the entry behind.
     */
    close: (then?: () => void) => void;
    /** Scrolls the panel so `target` (something inside it) is in the middle: the current song of a long list */
    reveal: (target: HTMLElement) => void;
    /** Closes it without touching the history: for a screen that is being replaced anyway */
    release: () => void;
    isOpen: () => boolean;
}

/**
 * A panel that slides up from the bottom over the screen, with a scrim: for what is needed now and
 * then (the tools, the list of songs) and must not take room from the lyrics the rest of the time.
 * Closes with the scrim, the Escape key, the back button or `close()`; while closed it is inert, so
 * the keyboard and screen readers skip it. Focus goes into the panel when it opens and back to where it was when it
 * closes.
 *
 * @param label what a screen reader calls the panel
 * @param onOpen called just before it slides up (to fill it with what is current)
 */
export function createSheet(label: string, onOpen?: () => void | Promise<void>, options: SheetOptions = {}): Sheet {
    const body = h('div', { class: 'sheet__body' });
    const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' },
        h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }), body);
    const scrim = h('div', { class: 'sheet__scrim' });
    const element = h('div', { class: options.anchored === true ? 'sheet-layer sheet-layer--anchored' : 'sheet-layer' }, scrim, panel);
    panel.inert = true;
    let opener: Element | null = null;
    let open = false;
    /** Whether it took an entry in the history, which the back button gives back */
    let holdsEntry = false;
    const self = { closeFromBack: () => release() };
    /** The button an anchored sheet sits beside, and what watches the sheet and the window while it is open */
    let anchor: Element | null = null;
    let watcher: ResizeObserver | undefined;
    const wide = window.matchMedia(WIDE);

    /** Puts the menu beside its button: its right edge under the button's, below it or above it, always inside the window */
    const place = (): void => {
        if (options.anchored !== true || !open) {
            return;
        }
        if (!wide.matches || anchor === null || !anchor.isConnected) {
            // A phone (or a window that became one): the sheet from the bottom, with nothing of ours on it. A button
            // redrawn away leaves the menu where it was.
            if (!wide.matches) {
                panel.style.removeProperty('left');
                panel.style.removeProperty('top');
            }

            return;
        }
        const button = anchor.getBoundingClientRect();
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const below = window.innerHeight - button.bottom - GAP - EDGE;
        const above = button.top - GAP - EDGE;
        const top = height <= below || below >= above ? button.bottom + GAP : button.top - GAP - height;
        panel.style.left = `${Math.max(EDGE, Math.min(button.right - width, window.innerWidth - width - EDGE))}px`;
        panel.style.top = `${Math.max(EDGE, Math.min(top, window.innerHeight - height - EDGE))}px`;
    };

    /** Everything about closing except the history */
    const release = (): void => {
        if (!open) {
            return;
        }
        open = false;
        holdsEntry = false;
        opened.splice(opened.indexOf(self), 1);
        element.classList.remove('is-open');
        panel.inert = true;
        document.removeEventListener('keydown', onKey);
        watcher?.disconnect();
        window.removeEventListener('resize', place);
        if (opener instanceof HTMLElement && opener.isConnected) {
            opener.focus({ preventScroll: true });
        }
    };
    const close = (then?: () => void): void => {
        if (!open) {
            then?.();

            return;
        }
        const hadEntry = holdsEntry;
        release();
        if (hadEntry) {
            ownBacks.push(then);
            history.back();
        } else {
            then?.();
        }
    };
    const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            close();
        }
    };
    scrim.addEventListener('click', () => close());

    return {
        element,
        body,
        close,
        reveal: (target) => {
            panel.scrollTop = target.offsetTop - (panel.clientHeight - target.offsetHeight) / 2;
        },
        release,
        isOpen: () => open,
        open: (trigger) => {
            if (open) {
                return;
            }
            open = true;
            opener = document.activeElement;
            // A click does not always focus a button (Safari), so the button is given, not guessed
            if (trigger instanceof Element) {
                anchor = trigger;
            }
            void Promise.resolve(onOpen?.()).then(() => {
                if (!open) {
                    return;
                }
                history.pushState({ sheet: true }, '', location.href);
                holdsEntry = true;
                opened.push(self);
                element.classList.add('is-open');
                panel.inert = false;
                // preventScroll: focusing a panel that is still sliding in would scroll the screen under it
                panel.focus({ preventScroll: true });
                document.addEventListener('keydown', onKey);
                if (options.anchored === true) {
                    // Its height changes when it is filled again (a submenu), and so does the window
                    watcher = new ResizeObserver(place);
                    watcher.observe(panel);
                    window.addEventListener('resize', place);
                    place();
                }
            });
        },
    };
}

/** A row of a sheet: an icon and what it does, big enough to tap, and a quiet line under it if it needs one */
export function sheetAction(name: IconName, label: string, run: () => void, options: { danger?: boolean; hint?: string; lit?: boolean } = {}): HTMLElement {
    const button = h('button', { type: 'button', class: ['sheet-action', ...(options.danger === true ? ['is-danger'] : []), ...(options.lit === true ? ['is-lit'] : [])].join(' ') },
        icon(name, 20), h('span', { class: 'sheet-action__text' }, label, ...(options.hint === undefined ? [] : [h('small', {}, options.hint)])));
    button.addEventListener('click', run);

    return button;
}

/** The title of a sheet or menu, with a line under it if it needs one: the first row of its `sheetList` */
export function sheetHead(title: string, sub?: string): HTMLElement {
    return h('div', { class: 'sheet-head' }, h('h4', { class: 'sheet__title' }, title), ...(sub === undefined || sub === '' ? [] : [h('p', { class: 'sheet__sub' }, sub)]));
}

/**
 * The rows of a sheet or menu as one list with no bullets: one `<li>` for the title (`sheetHead`) and for each option,
 * so the space and the line between any two rows is the list's and nothing else's (see `.sheet-list` in the styles).
 */
export function sheetList(...items: HTMLElement[]): HTMLElement {
    return h('ul', { class: 'sheet-list' }, ...items.map((item) => h('li', { class: item.classList.contains('sheet-head') ? 'sheet-list__head' : '' }, item)));
}

/** A list that comes after other content (tools, a toolbar): with room before it */
export function spaced(list: HTMLElement): HTMLElement {
    list.classList.add('sheet-list--spaced');

    return list;
}
