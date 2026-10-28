import { h } from '../dom.ts';

export interface Sheet {
    /** The panel; its scrim comes with it. Put it inside the screen it covers (a positioned element). */
    element: HTMLElement;
    /** Where the content goes */
    body: HTMLElement;
    open: () => void;
    close: () => void;
    isOpen: () => boolean;
}

/**
 * A panel that slides up from the bottom over the screen, with a scrim: for what is needed now and
 * then (the tools, the list of songs) and must not take room from the lyrics the rest of the time.
 * Closes with the scrim, the Escape key or `close()`; while closed it is inert, so the keyboard and
 * screen readers skip it. Focus goes into the panel when it opens and back to where it was when it
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

    const close = (): void => {
        if (!open) {
            return;
        }
        open = false;
        element.classList.remove('is-open');
        panel.inert = true;
        document.removeEventListener('keydown', onKey);
        if (opener instanceof HTMLElement && opener.isConnected) {
            opener.focus();
        }
    };
    const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            close();
        }
    };
    scrim.addEventListener('click', close);

    return {
        element,
        body,
        close,
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
                element.classList.add('is-open');
                panel.inert = false;
                panel.focus();
                document.addEventListener('keydown', onKey);
            });
        },
    };
}
