import { h } from '../dom.ts';

export interface ConfirmOptions {
    title: string;
    text: string;
    /** The words of the button that does it ("Eliminar") */
    confirm: string;
    /** Red button: the action cannot be undone */
    danger?: boolean;
}

/**
 * A question the person must answer before something that cannot be undone. Drawn by the app, so it looks
 * the same on every device (the browser's `confirm()` does not). Focus starts on "Cancelar", the safe
 * answer; Escape, a touch outside it and the back button all mean "Cancelar".
 *
 * @returns true only when the person pressed the button that does it
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        const cancel = h('button', { type: 'button', class: 'button' }, 'Cancelar');
        const confirm = h('button', { type: 'button', class: `button ${options.danger === true ? 'button--danger-solid' : 'button--primary'}` }, options.confirm);
        const panel = h('div', { class: 'confirm__panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-title', 'aria-describedby': 'confirm-text' },
            h('h3', { id: 'confirm-title', class: 'confirm__title' }, options.title),
            h('p', { id: 'confirm-text', class: 'confirm__text' }, options.text),
            h('div', { class: 'confirm__buttons' }, cancel, confirm));
        const scrim = h('div', { class: 'confirm__scrim' });
        const layer = h('div', { class: 'confirm' }, scrim, panel);
        const opener = document.activeElement;

        const finish = (answer: boolean): void => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('popstate', onBack);
            layer.remove();
            if (opener instanceof HTMLElement && opener.isConnected) {
                opener.focus({ preventScroll: true });
            }
            resolve(answer);
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                finish(false);
            } else if (event.key === 'Tab') {
                // Two buttons: Tab goes round them and never out to the screen behind
                event.preventDefault();
                (document.activeElement === cancel ? confirm : cancel).focus();
            }
        };
        const onBack = (): void => finish(false);

        cancel.addEventListener('click', () => finish(false));
        confirm.addEventListener('click', () => finish(true));
        scrim.addEventListener('click', () => finish(false));
        document.addEventListener('keydown', onKey);
        window.addEventListener('popstate', onBack);
        document.body.append(layer);
        cancel.focus({ preventScroll: true });
    });
}
