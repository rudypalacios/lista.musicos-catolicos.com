import { api, ApiError } from '../api.ts';
import { h } from '../dom.ts';
import type { View } from './types.ts';

export interface SignInOptions {
    /** Gets the email once the server accepted the credentials */
    onSignedIn: (email: string) => void;
    /** Said above the form (the session ended) */
    message?: string;
    /** When there is somewhere to go back to (the welcome, or the app of a person with no account), adds a "Volver" */
    onCancel?: () => void;
    /** Adds "Olvidé mi contraseña", which leads to choosing a new one by email */
    onForgot?: () => void;
}

/** The sign-in form */
export function signInView(options: SignInOptions): View {
    const email = h('input', {
        id: 'email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email',
    });
    const password = h('input', {
        id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true,
    });
    const error = h('p', { class: 'error', role: 'alert' }, options.message ?? '');
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Entrar');
    const forgot = h('button', { type: 'button', class: 'link' }, 'Olvidé mi contraseña');
    forgot.addEventListener('click', () => options.onForgot?.());
    const back = h('button', { type: 'button', class: 'link' }, 'Volver');
    back.addEventListener('click', () => options.onCancel?.());
    const form = h(
        'form',
        { class: 'card', novalidate: true },
        h('h2', {}, 'Inicia sesión'),
        h('label', { for: 'email' }, 'Correo'),
        email,
        h('label', { for: 'password' }, 'Contraseña'),
        password,
        error,
        submit,
        ...(options.onForgot === undefined && options.onCancel === undefined
            ? []
            : [h('div', { class: 'actions' }, ...(options.onForgot === undefined ? [] : [forgot]), ...(options.onCancel === undefined ? [] : [back]))]),
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
    queueMicrotask(() => email.focus());

    return { element: h('div', { class: 'page' }, form) };
}
