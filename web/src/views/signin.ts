import { api, ApiError } from '../api.ts';
import { h } from '../dom.ts';
import type { View } from './types.ts';

/** The sign-in form. `onSignedIn` gets the email once the server accepted the credentials. */
export function signInView(onSignedIn: (email: string) => void, message = ''): View {
    const email = h('input', {
        id: 'email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email',
    });
    const password = h('input', {
        id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true,
    });
    const error = h('p', { class: 'error', role: 'alert' }, message);
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Entrar');
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
    );

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        api.login(email.value, password.value)
            .then((me) => onSignedIn(me.email))
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
