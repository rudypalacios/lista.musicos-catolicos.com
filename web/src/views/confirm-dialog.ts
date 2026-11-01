import { h } from '../dom.ts';

export interface ConfirmOptions {
    title: string;
    text: string;
    /** The words of the button that does it ("Eliminar") */
    confirm: string;
    /** Red button: the action cannot be undone */
    danger?: boolean;
}

/** One answer of a `chooseDialog` */
export interface Choice<T> {
    /** The words of its button */
    label: string;
    value: T;
    /** `primary` (the main answer), `danger` (cannot be undone) or a plain button */
    kind?: 'primary' | 'danger';
}

export interface ChooseOptions<T> {
    title: string;
    text: string;
    /** The words of the button that answers nothing and leaves things as they are ("Cancelar"); first and focused */
    cancel: string;
    choices: readonly Choice<T>[];
}

/**
 * A question the person must answer, drawn by the app so it looks the same on every device (the browser's
 * `confirm()` does not). Focus starts on the cancelling button, the safe answer; Escape, a touch outside the
 * dialog and the back button all mean it too.
 *
 * @returns the value of the button pressed, or null when the person cancelled
 */
export function chooseDialog<T>(options: ChooseOptions<T>): Promise<T | null> {
    return new Promise((resolve) => {
        const cancel = h('button', { type: 'button', class: 'button' }, options.cancel);
        const buttons = options.choices.map((choice) => {
            const style = choice.kind === 'danger' ? 'button--danger-solid' : choice.kind === 'primary' ? 'button--primary' : '';
            const button = h('button', { type: 'button', class: `button ${style}`.trim() }, choice.label);
            button.addEventListener('click', () => finish(choice.value));

            return button;
        });
        const all = [cancel, ...buttons];
        const panel = h('div', { class: 'confirm__panel', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-title', 'aria-describedby': 'confirm-text' },
            h('h3', { id: 'confirm-title', class: 'confirm__title' }, options.title),
            h('p', { id: 'confirm-text', class: 'confirm__text' }, options.text),
            h('div', { class: 'confirm__buttons' }, ...all));
        const scrim = h('div', { class: 'confirm__scrim' });
        const layer = h('div', { class: 'confirm' }, scrim, panel);
        const opener = document.activeElement;

        const finish = (answer: T | null): void => {
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
                finish(null);
            } else if (event.key === 'Tab') {
                // The buttons go round and never out to the screen behind
                event.preventDefault();
                const at = all.indexOf(document.activeElement as HTMLButtonElement);
                const step = event.shiftKey ? -1 : 1;
                all[(at + step + all.length) % all.length]?.focus();
            }
        };
        const onBack = (): void => finish(null);

        cancel.addEventListener('click', () => finish(null));
        scrim.addEventListener('click', () => finish(null));
        document.addEventListener('keydown', onKey);
        window.addEventListener('popstate', onBack);
        document.body.append(layer);
        cancel.focus({ preventScroll: true });
    });
}

/**
 * A question before something that cannot be undone: "Cancelar" and one button that does it.
 *
 * @returns true only when the person pressed the button that does it
 */
export async function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    const answer = await chooseDialog({
        title: options.title,
        text: options.text,
        cancel: 'Cancelar',
        choices: [{ label: options.confirm, value: true, kind: options.danger === true ? 'danger' : 'primary' }],
    });

    return answer === true;
}
