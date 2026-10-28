import { h } from './dom.ts';

/** How long a message stays on screen (ms) */
const VISIBLE_FOR = 2800;

export interface Toast {
    /** Changes the words of a message that is still on screen (and keeps it a little longer) */
    update: (text: string) => void;
}

let region: HTMLElement | null = null;
/** Until when (ms since the epoch) a message that must be read keeps the ordinary ones away */
let heldUntil = 0;

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
 * typed, and this says so. A message that `mustRead` (a warning) holds the screen for its time:
 * ordinary ones that come meanwhile are dropped.
 */
export function showToast(text: string, visibleFor: number = VISIBLE_FOR, mustRead = false): Toast {
    // The "Guardado" of the save that comes right after must not wipe a warning off the screen
    if (!mustRead && Date.now() < heldUntil) {
        return { update: () => undefined };
    }
    if (mustRead) {
        heldUntil = Date.now() + visibleFor;
    }
    const element = h('p', { class: 'toast' }, text);
    // Replace a message still on screen: a burst of saves is one message, not a pile
    toastRegion().replaceChildren(element);
    let timer = setTimeout(() => element.remove(), visibleFor);

    return {
        update: (next) => {
            if (!element.isConnected) {
                return;
            }
            element.textContent = next;
            clearTimeout(timer);
            timer = setTimeout(() => element.remove(), visibleFor);
        },
    };
}
