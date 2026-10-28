import { h } from '../dom.ts';

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

export interface Sheet {
    /** The panel; its scrim comes with it. Put it inside the screen it covers (a positioned element). */
    element: HTMLElement;
    /** Where the content goes */
    body: HTMLElement;
    open: () => void;
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
export function createSheet(label: string, onOpen?: () => void | Promise<void>): Sheet {
    const body = h('div', { class: 'sheet__body' });
    const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' },
        h('div', { class: 'sheet__grab', 'aria-hidden': 'true' }), body);
    const scrim = h('div', { class: 'sheet__scrim' });
    const element = h('div', { class: 'sheet-layer' }, scrim, panel);
    panel.inert = true;
    let opener: Element | null = null;
    let open = false;
    /** Whether it took an entry in the history, which the back button gives back */
    let holdsEntry = false;
    const self = { closeFromBack: () => release() };

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
        open: () => {
            if (open) {
                return;
            }
            open = true;
            opener = document.activeElement;
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
            });
        },
    };
}
