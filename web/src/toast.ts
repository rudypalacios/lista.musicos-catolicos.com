import { h } from './dom.ts';

/** How long a message stays on screen (ms) */
const VISIBLE_FOR = 2800;

export interface Toast {
    /** Changes the words of a message that is still on screen (and keeps it a little longer) */
    update: (text: string) => void;
}

let region: HTMLElement | null = null;

/** The live region the messages go in: made on first use, so a screen reader announces them */
function toastRegion(): HTMLElement {
    if (region === null || !region.isConnected) {
        region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
        document.body.append(region);
    }

    return region;
}

/**
 * A short message that goes away by itself and never blocks anything ("Guardado"). It is the
 * answer to a save the person did not ask for by pressing a button: everything saves as it is
 * typed, and this says so.
 */
export function showToast(text: string): Toast {
    const element = h('p', { class: 'toast' }, text);
    // Replace a message still on screen: a burst of saves is one message, not a pile
    toastRegion().replaceChildren(element);
    let timer = setTimeout(() => element.remove(), VISIBLE_FOR);

    return {
        update: (next) => {
            if (!element.isConnected) {
                return;
            }
            element.textContent = next;
            clearTimeout(timer);
            timer = setTimeout(() => element.remove(), VISIBLE_FOR);
        },
    };
}
