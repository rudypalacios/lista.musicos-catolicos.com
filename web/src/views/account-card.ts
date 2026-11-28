import { initialOf } from '../account.ts';
import { api } from '../api.ts';
import type { App } from '../app.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import { downloadButton } from './delete-account.ts';
import type { Account, Navigate } from './types.ts';

/**
 * The account at the top of Ajustes (the owner asked for it on 2026-11-28, from a mockup): who is in, how they sign in, whether the
 * address is confirmed, and what is done with the account: "Cerrar sesión" and "Descargar mis cantos". With no account it says so
 * and offers to create one or sign in, and the download is there too (what a guest wrote lives only on this device).
 */
export function accountCard(data: App, account: Account): HTMLElement {
    const download = downloadButton(data, 'Descargar mis cantos');
    if (account.email === null) {
        const signUp = h('button', { type: 'button', class: 'button button--primary' }, 'Crear cuenta');
        signUp.addEventListener('click', () => account.signUp());
        const signIn = h('button', { type: 'button', class: 'button' }, 'Ya tengo cuenta');
        signIn.addEventListener('click', () => account.signIn());

        return h('section', { class: 'settings__account acct', 'aria-label': 'Cuenta' },
            h('p', { class: 'muted' }, 'Sin cuenta. Tus cantos, listados y plantillas están solo en este dispositivo. Si borras los datos del navegador, se pierden.'),
            signUp,
            signIn,
            download);
    }

    const how = h('span', { class: 'acct__how' });
    const chips = h('div', { class: 'acct__chips' });
    /** Says the address is not confirmed yet, with the way to send the link again; empty while it is (or while it is not known) */
    const unconfirmed = h('div', { class: 'settings__unconfirmed', role: 'status' });
    api.me()
        .then((me) => {
            how.textContent = me.google === true ? 'Entras con Google' : 'Entras con correo y contraseña';
            if (me.verified === false) {
                const resend = h('button', { type: 'button', class: 'button' }, 'Volver a mandar el enlace');
                resend.addEventListener('click', () => {
                    resend.disabled = true;
                    api.resendVerification()
                        .then((answer) => showToast(answer.mailSent ? 'Te mandamos el enlace otra vez' : 'No se pudo mandar el correo. Inténtalo en un rato.', 4000, true))
                        .catch((failure: unknown) => showToast(failure instanceof Error ? failure.message : 'No se pudo mandar.', 4000, true))
                        .finally(() => {
                            resend.disabled = false;
                        });
                });
                unconfirmed.replaceChildren(
                    h('p', { class: 'muted' }, 'Tu correo todavía no está confirmado. Abre el enlace que te mandamos; sin confirmarlo no podrás recuperar tu contraseña.'),
                    resend);
            } else if (me.verified === true) {
                chips.replaceChildren(h('span', { class: 'acct__chip' }, icon('check', 14), 'Correo confirmado'));
            }
        })
        // Offline, or the session ended: nothing to say, and nothing is wrong with the account
        .catch(() => undefined);

    const signOut = h('button', { type: 'button', class: 'button' }, icon('logout', 18), 'Cerrar sesión');
    signOut.addEventListener('click', () => account.signOut());

    return h('section', { class: 'settings__account acct', 'aria-label': 'Cuenta' },
        h('div', { class: 'acct__who' },
            h('span', { class: 'acct__avatar', 'aria-hidden': 'true' }, initialOf(account.email)),
            h('div', { class: 'acct__id' }, h('strong', {}, account.email), how)),
        chips,
        unconfirmed,
        signOut,
        download);
}

/** The quiet zone at the end of Ajustes, away from "Cerrar sesión": the way to delete the account, as a button with an outline */
export function deleteZone(navigate: Navigate): HTMLElement {
    const button = h('button', { type: 'button', class: 'button button--danger-outline' }, icon('trash', 18), 'Eliminar mi cuenta…');
    button.addEventListener('click', () => navigate(paths.deleteAccount()));

    return h('section', { class: 'settings__danger' },
        h('h3', {}, 'Eliminar cuenta'),
        h('p', { class: 'muted' }, 'Borra tu cuenta y todo lo que guardaste en ella. No se puede deshacer.'),
        button);
}
