import { h } from '../dom.ts';
import { brandLockup } from './brand.ts';
import { orDivider, privacyLine } from './gate-parts.ts';
import { googleOption } from './google-button.ts';
import type { View } from './types.ts';

export interface WelcomeOptions {
    /** Starts using the app with no account: what is written stays on this device */
    onTry: () => void;
    /** Shows the screen to sign in or create an account with an email */
    onEmail: () => void;
    /** Said above the buttons when there is something the person should know (no connection, for one) */
    message?: string;
}

/**
 * What a device with nothing on it and no session shows first: the mark of Músicos Católicos, its name and what the app is for, all
 * centred, then three ways in (the app is not behind a login), from the easiest:
 * Google (which makes the account if there is none), an email (to sign in or to create the account), or trying the app with
 * no account and signing in later, keeping what was written.
 */
export function welcomeView(options: WelcomeOptions): View {
    const email = h('button', { type: 'button', class: 'button welcome__email' }, 'Usar mi correo');
    email.addEventListener('click', options.onEmail);
    const tryIt = h('button', { type: 'button', class: 'button button--text' }, 'Probar sin cuenta');
    tryIt.addEventListener('click', options.onTry);

    const element = h('div', { class: 'page page--gate welcome' },
        brandLockup(),
        h('p', { class: 'muted brand__lead' }, 'Prepara la música de la misa: arma tu listado, cambia el tono de cada canto y léelo sin conexión.'),
        h('div', { class: 'welcome__actions' },
            googleOption(),
            email,
            orDivider('o'),
            tryIt,
            h('p', { class: 'muted welcome__note' }, 'Sin cuenta, lo que escribas se queda en este dispositivo y lo puedes llevar a tu cuenta después.')),
        ...(options.message === undefined ? [] : [h('p', { class: 'muted', role: 'status' }, options.message)]),
        privacyLine());

    return { element };
}
