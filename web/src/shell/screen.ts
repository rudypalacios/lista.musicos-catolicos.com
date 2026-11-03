import { h } from '../dom.ts';
import type { View } from '../views/types.ts';

/** Where the screens go: the area under the bar when the frame is up, the whole page before that */
export interface Screen {
    /** Puts `view` where the person looks, and gives the one it replaces the chance to clean up after itself */
    show: (view: View) => void;
}

/** The screen of the app in `root`: one view at a time, and the previous one is disposed when it is replaced */
export function createScreen(root: HTMLElement): Screen {
    let current: View | null = null;

    return {
        show: (view) => {
            current?.dispose?.();
            current = view;
            const container = document.getElementById('view');
            if (container === null) {
                root.replaceChildren(view.element);
            } else {
                container.replaceChildren(view.element);
                container.scrollTop = 0;
            }
        },
    };
}

/** A screen that only says something ("this song does not exist") */
export function notice(text: string): View {
    return { element: h('div', { class: 'page' }, h('p', { class: 'card' }, text)) };
}

/** A spinner and a sentence: anything slower than a moment says what it is waiting for */
export function splash(text: string): HTMLElement {
    return h('div', { class: 'splash', role: 'status' }, h('span', { class: 'spinner spinner--big', 'aria-hidden': 'true' }), h('p', {}, text));
}
