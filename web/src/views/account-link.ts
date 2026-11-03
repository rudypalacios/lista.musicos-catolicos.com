import { ApiError, api } from '../api.ts';
import { passwordProblem } from '../account.ts';
import { h } from '../dom.ts';

/** The page a link of an email opens: it needs no session and is often opened in another browser than the one that signed up */
const OPEN_THE_APP = (): HTMLElement => h('a', { class: 'button button--primary', href: '/' }, 'Abrir Listas');

function frame(root: HTMLElement, ...content: (Node | string)[]): void {
    root.replaceChildren(
        h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
        h('main', { id: 'view' }, h('div', { class: 'page' }, h('div', { class: 'card welcome__card' }, ...content))),
    );
}

/** `/verificar/:token`: confirms the address as soon as the page opens, and says what happened */
export function startVerifyEmail(root: HTMLElement, token: string): void {
    frame(root, h('p', { class: 'muted', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Confirmando tu correo…'));
    api.verifyEmail(token)
        .then((answer) => frame(root,
            h('h2', {}, 'Correo confirmado'),
            h('p', {}, `Listo: ${answer.email} es tuyo. Ya puedes elegir una contraseña nueva si algún día la olvidas.`),
            h('div', { class: 'actions welcome__actions' }, OPEN_THE_APP())))
        .catch((failure: unknown) => frame(root,
            h('h2', {}, 'Este enlace ya no sirve'),
            h('p', {}, failure instanceof ApiError && failure.isOffline
                ? 'Necesitas conexión para confirmar tu correo. Abre el enlace otra vez cuando la tengas.'
                : 'Ya se usó o venció. Si ya confirmaste tu correo, no hace falta nada más; si no, pide otro enlace desde Ajustes, en la app.'),
            h('div', { class: 'actions welcome__actions' }, OPEN_THE_APP())));
}

/** `/restablecer/:token`: the form to choose the new password; every session of the account ends when it is chosen */
export function startResetPassword(root: HTMLElement, token: string): void {
    const password = h('input', { id: 'reset-password', name: 'password', type: 'password', autocomplete: 'new-password', required: true });
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Guardar la contraseña');
    const form = h('form', { novalidate: true, class: 'welcome__card' },
        h('h2', {}, 'Elige una contraseña nueva'),
        h('label', { for: 'reset-password' }, 'Contraseña nueva'),
        password,
        h('p', { class: 'muted' }, 'Al menos 10 caracteres. Una frase larga es mejor que una palabra con símbolos.'),
        error,
        submit);
    frame(root, form);

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = passwordProblem(password.value) ?? '';
        if (error.textContent !== '') {
            return;
        }
        submit.disabled = true;
        api.resetPassword(token, password.value)
            .then(() => frame(root,
                h('h2', {}, 'Contraseña cambiada'),
                h('p', {}, 'Ya puedes iniciar sesión con la contraseña nueva. Las sesiones que tenías abiertas se cerraron.'),
                h('div', { class: 'actions welcome__actions' }, OPEN_THE_APP())))
            .catch((failure: unknown) => {
                if (failure instanceof ApiError && failure.code === 'invalid_token') {
                    frame(root,
                        h('h2', {}, 'Este enlace ya no sirve'),
                        h('p', {}, 'Ya se usó o venció. Pide otro desde «Olvidé mi contraseña», en la pantalla de iniciar sesión.'),
                        h('div', { class: 'actions welcome__actions' }, OPEN_THE_APP()));

                    return;
                }
                error.textContent = failure instanceof ApiError && failure.isOffline
                    ? 'Necesitas conexión para esto.'
                    : failure instanceof Error ? failure.message : 'No se pudo cambiar la contraseña.';
                submit.disabled = false;
            });
    });
    queueMicrotask(() => password.focus());
}
