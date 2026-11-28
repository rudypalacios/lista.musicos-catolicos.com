import { ApiError, api } from '../api.ts';
import type { App } from '../app.ts';
import { downloadLibrary } from '../download.ts';
import { describeGuestWork, hasGuestWork } from '../guest.ts';
import { h, link } from '../dom.ts';
import { icon } from '../icons.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import type { Account, View } from './types.ts';

/** How long the account is kept after the person confirms, in words (the server's `AccountDeletion::GRACE_DAYS`) */
export const GRACE_WORDS = '3 días';

/** A copy of what the device holds, with the words the app says when it works or when there is nothing to take */
export function downloadButton(data: App, label: string): HTMLButtonElement {
    const button = h('button', { type: 'button', class: 'button button--accent-outline' }, icon('download', 18), label);
    button.addEventListener('click', () => {
        button.disabled = true;
        downloadLibrary(data)
            .then((songs) => showToast(songs === null ? 'Todavía no hay nada que descargar.' : `Listo: ${songs} ${songs === 1 ? 'canto' : 'cantos'} en un archivo .zip.`, 4000, true))
            .catch(() => showToast('No se pudo preparar la descarga. Inténtalo de nuevo.', 4000, true))
            .finally(() => {
                button.disabled = false;
            });
    });

    return button;
}

/**
 * Ajustes → "Eliminar mi cuenta…" (`/ajustes/eliminar`): what goes, a copy to take first, and the button that sends the link to the
 * account's email. Nothing is deleted here: the link has to be opened and answered, and then the account is kept 3 days more. The
 * person who only wants to leave the app on this device is offered "Cerrar sesión" in a sentence, as a link.
 */
export function deleteAccountView(data: App, account: Account): View {
    const email = account.email ?? '';
    const gone = h('ul', { class: 'delete-account__gone' },
        h('li', {}, 'Tu cuenta y tu correo'),
        h('li', {}, 'Los enlaces que compartiste: dejan de funcionar'));
    // What the device holds is what the person has: it is told in numbers, as soon as they are known
    void data.guestWork().then((work) => {
        if (hasGuestWork(work)) {
            gone.insertBefore(h('li', {}, describeGuestWork(work)), gone.children[1] ?? null);
        }
    });
    const google = h('p', { class: 'delete-account__google', hidden: true }, 'Tu cuenta de Google no se toca: solo se borra lo que guardaste en Listas.');
    // Whether it signs in with Google is known by the server
    api.me().then((me) => {
        google.hidden = me.google !== true;
    }).catch(() => undefined);

    const say = h('p', { class: 'error', role: 'alert' });
    const send = h('button', { type: 'button', class: 'button button--danger-solid' }, 'Mandar enlace de confirmación');
    const signOut = h('button', { type: 'button', class: 'link link--inline' }, 'Cerrar sesión');
    signOut.addEventListener('click', () => account.signOut());
    const body = h('div', { class: 'card delete-account' });
    const element = h('div', { class: 'page page--gate delete-page' }, body);

    const askAgain = (): void => {
        say.textContent = '';
        send.disabled = true;
        api.requestAccountDeletion()
            .then((answer) => (answer.mailSent ? sent() : Promise.reject(new Error('No se pudo mandar el correo. Inténtalo en un rato.'))))
            .catch((failure: unknown) => {
                say.textContent = failure instanceof ApiError && failure.isOffline
                    ? 'Necesitas conexión para eliminar tu cuenta.'
                    : failure instanceof Error ? failure.message : 'No se pudo mandar el enlace.';
                send.disabled = false;
            });
    };
    send.addEventListener('click', askAgain);

    /** The link went out: say where, and that nothing is deleted until it is opened and answered */
    const sent = (): void => {
        const again = h('button', { type: 'button', class: 'button' }, 'Volver a mandarlo');
        again.addEventListener('click', () => {
            again.disabled = true;
            api.requestAccountDeletion()
                .then((answer) => showToast(answer.mailSent ? 'Te lo mandamos otra vez' : 'No se pudo mandar el correo. Inténtalo en un rato.', 4000, true))
                .catch((failure: unknown) => showToast(failure instanceof Error ? failure.message : 'No se pudo mandar.', 4000, true))
                .finally(() => {
                    again.disabled = false;
                });
        });
        body.classList.add('delete-account--center');
        body.replaceChildren(
            h('div', { class: 'delete-account__badge' }, icon('mail', 26)),
            h('h2', {}, 'Revisa tu correo'),
            h('p', {}, `Te mandamos un enlace a ${email}. Vence en 1 hora. Hasta que lo abras y confirmes, no se borra nada.`),
            h('div', { class: 'actions welcome__actions' }, again, link(paths.settings(), 'Volver a Ajustes', 'button button--text')));
    };

    body.append(
        h('h2', {}, '¿Eliminar tu cuenta?'),
        h('p', { class: 'muted' }, 'Esto se borra:'),
        gone,
        google,
        downloadButton(data, 'Descargar mis cantos antes'),
        h('p', { class: 'muted' }, 'Te mandamos un enlace a ', h('strong', {}, email), ` para confirmar. Después tu cuenta se guarda ${GRACE_WORDS} por si cambias de opinión, y luego se borra para siempre.`),
        say,
        send,
        h('p', { class: 'muted delete-account__leave' }, 'Si no quieres eliminar tu cuenta, sino solo salir de la aplicación, presiona ', signOut, '.'),
        link(paths.settings(), 'Cancelar', 'button button--text'));

    return { element };
}
