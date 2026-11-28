import { ApiError, api } from '../api.ts';
import { dayInWords } from '../dates.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import type { View } from './types.ts';

export interface KeepAccountOptions {
    /** The account is as it was: go on with signing in */
    onKeep: () => void;
    /** The person goes on with the deletion: the session is ended and they are where they were before */
    onLeave: () => void;
    /** When the account will be deleted (epoch ms) */
    deleteAfter: number;
}

/**
 * What a person who asked to delete their account sees when they sign in again before the 3 days are up: when it will go, and the
 * chance to keep it. Nothing of the app is open behind it (the server answers nothing else to a locked account).
 */
export function keepAccountView(options: KeepAccountOptions): View {
    const say = h('p', { class: 'error', role: 'alert' });
    const keep = h('button', { type: 'button', class: 'button button--primary' }, 'Conservar mi cuenta');
    keep.addEventListener('click', () => {
        keep.disabled = true;
        say.textContent = '';
        api.keepAccount()
            .then(() => options.onKeep())
            .catch((failure: unknown) => {
                say.textContent = failure instanceof ApiError && failure.isOffline ? 'Necesitas conexión para esto.' : failure instanceof Error ? failure.message : 'No se pudo conservar la cuenta.';
                keep.disabled = false;
            });
    });
    const leave = h('button', { type: 'button', class: 'button' }, 'Seguir con la eliminación');
    leave.addEventListener('click', options.onLeave);

    const element = h('div', { class: 'page page--gate' },
        h('div', { class: 'card delete-account delete-account--center' },
            h('div', { class: 'delete-account__badge delete-account__badge--danger' }, icon('trash', 26)),
            h('h2', {}, `Tu cuenta se eliminará el ${dayInWords(options.deleteAfter)}`),
            h('p', {}, 'Pediste eliminarla. ¿Quieres conservarla?'),
            say,
            h('div', { class: 'actions welcome__actions' }, keep, leave),
            h('p', { class: 'muted' }, 'Si la conservas, todo sigue como estaba, incluidos tus enlaces compartidos.')));

    return { element };
}

/**
 * `keepAccountView` over the whole screen, whatever is behind it (the app of a device that was signed out, or the page that waits for
 * a sign-in): it has no menu and no sync line, so nothing else can be touched while the person decides. It goes away when they answer.
 */
export function showKeepAccount(options: KeepAccountOptions): void {
    const view = keepAccountView({
        ...options,
        onKeep: () => {
            layer.remove();
            options.onKeep();
        },
        onLeave: () => {
            layer.remove();
            options.onLeave();
        },
    });
    const layer = h('div', { class: 'gate-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tu cuenta se eliminará' },
        h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
        h('div', { class: 'gate-overlay__body' }, view.element));
    document.body.append(layer);
    layer.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
}
