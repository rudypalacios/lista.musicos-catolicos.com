import { h } from '../dom.ts';
import type { View } from './types.ts';

export interface WelcomeOptions {
    /** Starts using the app with no account: what is written stays on this device */
    onTry: () => void;
    /** Shows the sign-in form */
    onSignIn: () => void;
    /** Shows the sign-up form; given only while anyone can create an account (the owner opens it) */
    onSignUp?: () => void;
    /** Said above the buttons when there is something the person should know (no connection, for one) */
    message?: string;
}

/**
 * What a device with nothing on it and no session shows first: the app is not behind a login. The person can try it
 * at once (and sign in later, keeping what they wrote) or sign in to an account they already have.
 */
export function welcomeView(options: WelcomeOptions): View {
    const tryIt = h('button', { type: 'button', class: 'button button--primary' }, 'Probar sin cuenta');
    tryIt.addEventListener('click', options.onTry);
    const signIn = h('button', { type: 'button', class: 'button' }, 'Ya tengo cuenta');
    signIn.addEventListener('click', options.onSignIn);
    const signUp = h('button', { type: 'button', class: 'button' }, 'Crear cuenta');
    signUp.addEventListener('click', () => options.onSignUp?.());

    const element = h('div', { class: 'page welcome' },
        h('div', { class: 'card welcome__card' },
            h('p', {}, 'Prepara la música de la misa: arma un listado con tus cantos, cambia el tono de cada uno y léelo sin conexión.'),
            ...(options.message === undefined ? [] : [h('p', { class: 'muted', role: 'status' }, options.message)]),
            h('div', { class: 'actions welcome__actions' }, tryIt, ...(options.onSignUp === undefined ? [] : [signUp]), signIn),
            h('p', { class: 'muted' }, 'Sin cuenta, lo que escribas se guarda solo en este dispositivo. Cuando inicies sesión, podrás llevarlo a tu cuenta.')));

    return { element };
}
