import { ApiError, api } from '../api.ts';
import { emailProblem } from '../account.ts';
import { h } from '../dom.ts';
import { createProofStatus } from './proof.ts';
import type { View } from './types.ts';

/**
 * "Olvidé mi contraseña": the email, and the server sends a link to choose a new one if there is an account. It answers the
 * same whether or not there is (so the form cannot be used to find who has one), and so does this screen.
 */
export function forgotView(options: { onBack: () => void }): View {
    const email = h('input', { id: 'forgot-email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email' });
    const error = h('p', { class: 'error', role: 'alert' });
    const proof = createProofStatus();
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Mandar el enlace');
    const back = h('button', { type: 'button', class: 'link' }, 'Volver');
    back.addEventListener('click', () => {
        proof.cancel();
        options.onBack();
    });
    const form = h('form', { class: 'card', novalidate: true },
        h('h2', {}, 'Elige una contraseña nueva'),
        h('p', { class: 'muted' }, 'Escribe el correo de tu cuenta y te mandamos un enlace para elegirla.'),
        h('label', { for: 'forgot-email' }, 'Correo'),
        email,
        error,
        proof.element,
        submit,
        back);
    const element = h('div', { class: 'page' }, form);

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = emailProblem(email.value) ?? '';
        if (error.textContent !== '') {
            return;
        }
        submit.disabled = true;
        void proof.obtain()
            .then((pow) => api.forgot(email.value.trim(), pow))
            .then(() => {
                form.replaceChildren(
                    h('h2', {}, 'Revisa tu correo'),
                    h('p', {}, 'Si hay una cuenta con ese correo, te mandamos un enlace para elegir una contraseña nueva. Vence en 1 hora.'),
                    h('p', { class: 'muted' }, 'Si no llega en unos minutos, mira en la carpeta de correo no deseado.'),
                    back);
            })
            .catch((failure: unknown) => {
                error.textContent = failure instanceof ApiError && failure.isOffline
                    ? 'Necesitas conexión para esto.'
                    : failure instanceof Error && failure.message !== 'cancelled' ? failure.message : 'No se pudo mandar el enlace.';
                submit.disabled = false;
            });
    });
    queueMicrotask(() => email.focus());

    return { element, dispose: () => proof.cancel() };
}
