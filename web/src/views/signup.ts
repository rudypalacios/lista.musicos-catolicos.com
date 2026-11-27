import { ApiError, api } from '../api.ts';
import { emailProblem, passwordProblem } from '../account.ts';
import { h } from '../dom.ts';
import { createProofStatus } from './proof.ts';
import type { View } from './types.ts';

export interface SignUpOptions {
    /** The account was made and the session is open; `mailSent` says whether the confirmation link went out */
    onCreated: (email: string, mailSent: boolean) => void;
    /** What to write in the email field to start with (the person had typed it in the other tab) */
    email?: string;
}

/** What the person is told for what the server refused */
function failureText(failure: unknown): string {
    if (failure instanceof ApiError) {
        if (failure.isOffline) {
            return 'Necesitas conexión para crear una cuenta.';
        }

        return failure.message;
    }

    return failure instanceof Error && failure.message !== 'cancelled' ? failure.message : 'No se pudo crear la cuenta.';
}

/**
 * The form to create an account: an email and a password (10 characters or more: length is what makes it hard to guess). The
 * device solves a puzzle before sending (see `createProofStatus`), so a script cannot make accounts by the thousand; the person
 * sees a sentence while it runs. It is the second tab of the access screen (`access.ts`), which has the link to the privacy page.
 */
export function signUpView(options: SignUpOptions): View {
    const email = h('input', {
        id: 'signup-email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email', value: options.email ?? '',
    });
    const password = h('input', { id: 'signup-password', name: 'password', type: 'password', autocomplete: 'new-password', required: true });
    const error = h('p', { class: 'error', role: 'alert' });
    const proof = createProofStatus();
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Crear cuenta');

    const form = h('form', { class: 'gate-form', novalidate: true },
        h('h2', { class: 'sr-only' }, 'Crea tu cuenta'),
        h('label', { for: 'signup-email' }, 'Correo'),
        email,
        h('label', { for: 'signup-password' }, 'Contraseña'),
        password,
        h('p', { class: 'muted gate-form__hint' }, 'Al menos 10 caracteres. Una frase larga es mejor que una palabra con símbolos.'),
        error,
        proof.element,
        submit);

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = emailProblem(email.value) ?? passwordProblem(password.value) ?? '';
        if (error.textContent !== '') {
            return;
        }
        submit.disabled = true;
        void proof.obtain()
            .then((pow) => api.register(email.value.trim(), password.value, pow))
            .then((account) => options.onCreated(account.email, account.mailSent))
            .catch((failure: unknown) => {
                error.textContent = failureText(failure);
                submit.disabled = false;
            });
    });

    return { element: form, dispose: () => proof.cancel() };
}
