import { ApiError, api } from '../api.ts';
import { emailProblem, passwordProblem, PRIVACY_URL } from '../account.ts';
import { h } from '../dom.ts';
import { createProofStatus } from './proof.ts';
import type { View } from './types.ts';

export interface SignUpOptions {
    /** The account was made and the session is open; `mailSent` says whether the confirmation link went out */
    onCreated: (email: string, mailSent: boolean) => void;
    /** The person already has an account */
    onSignIn: () => void;
    /** Where "Volver" goes (the welcome, or the app of a person with no account) */
    onCancel: () => void;
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
 * The sign-up form: email, a password (10 characters or more: length is what makes it hard to guess) and that the person read
 * how their data is used. The device solves a puzzle before sending (see `createProofStatus`), so a script cannot make accounts
 * by the thousand; the person sees a sentence while it runs.
 */
export function signUpView(options: SignUpOptions): View {
    const email = h('input', { id: 'signup-email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email' });
    const password = h('input', { id: 'signup-password', name: 'password', type: 'password', autocomplete: 'new-password', required: true });
    const consent = h('input', { id: 'signup-consent', type: 'checkbox' });
    const error = h('p', { class: 'error', role: 'alert' });
    const proof = createProofStatus();
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Crear cuenta');
    const back = h('button', { type: 'button', class: 'link' }, 'Volver');
    back.addEventListener('click', () => {
        proof.cancel();
        options.onCancel();
    });
    const signIn = h('button', { type: 'button', class: 'link' }, 'Ya tengo cuenta');
    signIn.addEventListener('click', () => {
        proof.cancel();
        options.onSignIn();
    });

    const form = h('form', { class: 'card', novalidate: true },
        h('h2', {}, 'Crea tu cuenta'),
        h('label', { for: 'signup-email' }, 'Correo'),
        email,
        h('label', { for: 'signup-password' }, 'Contraseña'),
        password,
        h('p', { class: 'muted' }, 'Al menos 10 caracteres. Una frase larga es mejor que una palabra con símbolos.'),
        h('label', { class: 'choice__option', for: 'signup-consent' }, consent,
            h('span', {}, 'Leí cómo se usan mis datos ', h('a', { href: PRIVACY_URL, target: '_blank', rel: 'noopener' }, 'Privacidad'), '.')),
        error,
        proof.element,
        submit,
        h('div', { class: 'actions' }, back, signIn));

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = emailProblem(email.value) ?? passwordProblem(password.value)
            ?? (consent.checked ? '' : 'Marca que leíste cómo se usan tus datos.');
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
    queueMicrotask(() => email.focus());

    return { element: h('div', { class: 'page' }, form), dispose: () => proof.cancel() };
}
