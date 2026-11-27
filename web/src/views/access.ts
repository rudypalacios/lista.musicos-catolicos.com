import { h } from '../dom.ts';
import { privacyLine } from './gate-parts.ts';
import { googleOption } from './google-button.ts';
import { signInView, type SignInOptions } from './signin.ts';
import { signUpView, type SignUpOptions } from './signup.ts';
import type { View } from './types.ts';

export type AccessMode = 'sign-in' | 'sign-up';

export interface AccessOptions {
    /** The tab it opens on */
    mode: AccessMode;
    signIn: Omit<SignInOptions, 'email'>;
    /** Where an account can be made from here; without it there are no tabs and the screen only signs in (a session that ended) */
    signUp?: Omit<SignUpOptions, 'email'>;
    /** When there is somewhere to go back to (the welcome, or the app of a person with no account), adds "← Volver" */
    onCancel?: () => void;
}

const TABS: readonly { mode: AccessMode; label: string }[] = [
    { mode: 'sign-in', label: 'Entrar' },
    { mode: 'sign-up', label: 'Crear cuenta' },
];

/**
 * What "Usar mi correo" opens, and what the bar's and Ajustes' "Crear cuenta" and "Ya tengo cuenta" open: Google on top (it
 * signs in or makes the account, whichever there is), and under it the form of the tab: Entrar or Crear cuenta. Changing tab
 * keeps what was typed in the email field. The way back and the line about privacy are under both.
 */
export function accessView(options: AccessOptions): View {
    const panel = h('div', { class: 'access__panel', role: 'tabpanel' });
    let current: View | null = null;
    let mode: AccessMode = options.mode;
    const tabs = new Map<AccessMode, HTMLButtonElement>();

    const show = (next: AccessMode, focus: boolean): void => {
        const typed = panel.querySelector<HTMLInputElement>('input[type="email"]')?.value ?? '';
        current?.dispose?.();
        mode = next;
        current = next === 'sign-up' && options.signUp !== undefined
            ? signUpView({ ...options.signUp, email: typed })
            : signInView({ ...options.signIn, email: typed });
        panel.replaceChildren(current.element);
        for (const [tabMode, tab] of tabs) {
            tab.setAttribute('aria-selected', String(tabMode === next));
            tab.tabIndex = tabMode === next ? 0 : -1;
        }
        if (focus) {
            panel.querySelector<HTMLInputElement>('input')?.focus();
        }
    };

    const tabList = options.signUp === undefined
        ? []
        : [h('div', { class: 'access__tabs', role: 'tablist' }, ...TABS.map(({ mode: tabMode, label }) => {
            const tab = h('button', { type: 'button', class: 'access__tab', role: 'tab' }, label);
            tab.addEventListener('click', () => {
                if (tabMode !== mode) {
                    show(tabMode, true);
                }
            });
            tabs.set(tabMode, tab);

            return tab;
        }))];

    const back = h('button', { type: 'button', class: 'link access__back' }, '← Volver');
    back.addEventListener('click', () => {
        current?.dispose?.();
        options.onCancel?.();
    });

    const element = h('div', { class: 'page page--gate access' },
        ...tabList,
        googleOption({ then: 'o con tu correo' }),
        panel,
        ...(options.onCancel === undefined ? [] : [back]),
        privacyLine());
    show(options.mode, false);

    return { element, dispose: () => current?.dispose?.() };
}
