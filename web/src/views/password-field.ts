import { confirmationProblem } from '../account.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface PasswordFieldOptions {
    id: string;
    name: string;
    /** `new-password` for a password being chosen, `current-password` for one being proved */
    autocomplete: 'new-password' | 'current-password';
}

export interface PasswordField {
    /** The input with its eye button, to place in a form */
    element: HTMLElement;
    input: HTMLInputElement;
}

/**
 * A password input with an eye button that shows what was typed, so the person can check it before it is used. The button is a
 * drawn icon (the same on every device), 44px, and says what it will do. The text is hidden again whenever the field is rebuilt.
 */
export function passwordField(options: PasswordFieldOptions): PasswordField {
    const input = h('input', { id: options.id, name: options.name, type: 'password', autocomplete: options.autocomplete, required: true });
    const eye = h('button', { type: 'button', class: 'password-field__eye', 'aria-pressed': 'false', 'aria-label': 'Mostrar la contraseña' });
    const draw = (shown: boolean): void => {
        eye.replaceChildren(icon(shown ? 'eye-off' : 'eye', 22));
        eye.setAttribute('aria-pressed', String(shown));
        eye.setAttribute('aria-label', shown ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
    };
    draw(false);
    eye.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        draw(show);
    });

    return { element: h('div', { class: 'password-field' }, input, eye), input };
}

export interface PasswordPair {
    /** Label, field, label, field and the line that says whether the two match, in order, to spread into a form */
    elements: HTMLElement[];
    password: HTMLInputElement;
    again: HTMLInputElement;
    /** Why the pair cannot be used yet (they differ), or null */
    problem: () => string | null;
}

/**
 * A new password asked twice, each with its eye, and a line under the second that says "Coinciden" or "No coinciden" as the
 * person types. `labels` are the words of the two fields.
 */
export function passwordPair(idPrefix: string, labels: { first: string; second: string }): PasswordPair {
    const first = passwordField({ id: `${idPrefix}-password`, name: 'password', autocomplete: 'new-password' });
    const second = passwordField({ id: `${idPrefix}-password-again`, name: 'password-again', autocomplete: 'new-password' });
    const status = h('p', { class: 'password-field__match', role: 'status' });
    const update = (): void => {
        if (second.input.value === '') {
            status.textContent = '';
            status.className = 'password-field__match';

            return;
        }
        const same = confirmationProblem(first.input.value, second.input.value) === null;
        status.textContent = same ? 'Coinciden' : 'No coinciden';
        status.className = `password-field__match ${same ? 'password-field__match--ok' : 'password-field__match--bad'}`;
    };
    first.input.addEventListener('input', update);
    second.input.addEventListener('input', update);

    return {
        elements: [
            h('label', { for: first.input.id }, labels.first),
            first.element,
            h('label', { for: second.input.id }, labels.second),
            second.element,
            status,
        ],
        password: first.input,
        again: second.input,
        problem: () => confirmationProblem(first.input.value, second.input.value),
    };
}
