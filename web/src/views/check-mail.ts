import { ApiError, api } from '../api.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { showToast } from '../toast.ts';
import type { View } from './types.ts';

/**
 * Where a new account lands: the confirmation link was sent to its address (or could not be, and it says so and offers to try
 * again). The person is already in and can go on with the app; confirming is what lets them recover the password later.
 */
export function checkMailView(options: { email: string; sent: boolean; onContinue: () => void }): View {
    const again = h('button', { type: 'button', class: 'button' }, options.sent ? 'Volver a mandarlo' : 'Mandarlo otra vez');
    const say = h('p', { class: 'error', role: 'alert' });
    again.addEventListener('click', () => {
        again.disabled = true;
        say.textContent = '';
        api.resendVerification()
            .then((answer) => showToast(answer.mailSent ? 'Te lo mandamos otra vez' : 'No se pudo mandar el correo. Inténtalo en un rato.', 4000, true))
            .catch((failure: unknown) => {
                say.textContent = failure instanceof ApiError && failure.isOffline ? 'Necesitas conexión para esto.' : failure instanceof Error ? failure.message : 'No se pudo mandar.';
            })
            .finally(() => {
                again.disabled = false;
            });
    });
    const go = h('button', { type: 'button', class: 'button button--primary' }, 'Continuar');
    go.addEventListener('click', options.onContinue);

    const element = h('div', { class: 'page' },
        h('div', { class: 'card welcome__card' },
            icon('info', 32),
            h('h2', {}, options.sent ? 'Te mandamos un enlace' : 'No pudimos mandar el correo'),
            h('p', {}, options.sent
                ? `Abre el mensaje que llegó a ${options.email} y toca el enlace para confirmar tu correo. Mientras tanto, tu cuenta ya funciona.`
                : `Tu cuenta ya funciona, pero el correo con el enlace para confirmar ${options.email} no salió. Puedes mandarlo otra vez.`),
            say,
            h('div', { class: 'actions welcome__actions' }, go, again)));

    return { element };
}
