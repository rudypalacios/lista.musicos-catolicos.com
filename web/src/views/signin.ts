import { api, ApiError } from '../api.ts';
import { h } from '../dom.ts';
import type { View } from './types.ts';

export interface SignInOptions {
    /** Gets the email once the server accepted the credentials */
    onSignedIn: (email: string) => void;
    /** Said above the form (the session ended) */
    message?: string;
    /** Adds "Olvidé mi contraseña", under the password, which leads to choosing a new one by email */
    onForgot?: () => void;
    /** What to write in the email field to start with (the person had typed it in the other tab) */
    email?: string;
}

/**
 * The form to sign in with an email. It is the first tab of the access screen (`access.ts`), which brings the way back, Google
 * and the privacy line; the heading is for screen readers, the tab already says it.
 */
export function signInView(options: SignInOptions): View {
    const email = h('input', {
        id: 'email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email', value: options.email ?? '',
    });
    const password = h('input', {
        id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true,
    });
    const error = h('p', { class: 'error', role: 'alert' }, options.message ?? '');
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Entrar');
    const forgot = h('button', { type: 'button', class: 'link' }, 'Olvidé mi contraseña');
    forgot.addEventListener('click', () => options.onForgot?.());
    const form = h(
        'form',
        { class: 'gate-form', novalidate: true },
        h('h2', { class: 'sr-only' }, 'Inicia sesión'),
        h('label', { for: 'email' }, 'Correo'),
        email,
        h('label', { for: 'password' }, 'Contraseña'),
        password,
        ...(options.onForgot === undefined ? [] : [h('div', { class: 'gate-form__aside' }, forgot)]),
        error,
        submit,
    );

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        api.login(email.value, password.value)
            .then((me) => options.onSignedIn(me.email))
            .catch((failure: unknown) => {
                error.textContent =
                    failure instanceof ApiError && failure.isOffline
                        ? 'Necesitas conexión para iniciar sesión.'
                        : failure instanceof Error
                          ? failure.message
                          : 'Algo salió mal.';
                submit.disabled = false;
            });
    });

    return { element: form };
}
