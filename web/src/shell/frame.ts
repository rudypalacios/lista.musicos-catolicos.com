import { signOut, type App } from '../app.ts';
import { h } from '../dom.ts';
import { watchBottomChrome } from '../bottom-chrome.ts';
import { createPullToRefresh, pullAnswer } from '../pull.ts';
import type { Route } from '../router.ts';
import { describeSync } from '../sync-line.ts';
import { showToast } from '../toast.ts';
import { confirmDialog } from '../views/confirm-dialog.ts';
import { createHeader, type Header } from '../views/header.ts';
import type { InstallBanner } from '../views/install-banner.ts';
import type { Account } from '../views/types.ts';
import { watchSaves } from './saves.ts';

/** What the frame needs to know about the person who is in, and what to do when they leave or have to come back */
export interface FrameOptions {
    /** Who is signed in; null for a person trying the app with no account */
    email: string | null;
    /** The person signed out (and this device forgot their songs) */
    onSignedOut: () => void;
    /** The session ended, or there is no account: show the way to sign in */
    onNeedsSignIn: () => void;
    /** A person with no account asks to create one */
    onSignUp: () => void;
}

/** The bar, the menu and the area under them that the screens fill */
export interface Frame {
    /** Builds the frame for the person in `options`; built again when somebody else signs in */
    mount: (options: FrameOptions) => void;
    /** Shows the bar and the menu that suit the screen; while singing a list they give their room to the song */
    markSection: (route: Route) => void;
    /** The header's sync line and sign-out, for the screen that puts the header away (Ajustes, singing) */
    account: () => Account;
}

/**
 * The frame around every screen: the header (bar and menu), pull down to sync, the install bar and the toasts that say a
 * change was saved. It knows who is in only to show it; what happens when they sign in or out is the session's.
 */
export function createFrame(root: HTMLElement, data: App, installBanner: InstallBanner): Frame {
    /** The bar and the menu, once the person is in */
    let header: Header | null = null;
    /** Who is in, for the account block of Ajustes; null for a person with no account */
    let email: string | null = '';
    let current: FrameOptions | null = null;
    /** Signs out, asking first when something written here was never sent */
    let requestSignOut: () => void = () => undefined;

    return {
        mount: (options) => {
            email = options.email;
            current = options;
            requestSignOut = () => {
                // Signing out takes the songs off this device (they stay in the account), and with no connection they cannot be
                // opened until the person signs in again: that is said before it happens, not after (the owner asked, 2026-11-28)
                void confirmDialog({
                    title: '¿Cerrar sesión?',
                    text: 'Tus cantos y listados siguen guardados en tu cuenta. Se quitan de este dispositivo, y sin conexión no podrás verlos hasta volver a entrar.',
                    confirm: 'Cerrar sesión',
                }).then((yes) => (yes ? leave() : undefined));
            };
            const leave = (): void => {
                void signOut(data, (unsent) =>
                    confirmDialog({
                        title: '¿Cerrar sesión de todos modos?',
                        text: unsent === 1
                            ? 'Hay 1 canto escrito en este dispositivo que no se pudo enviar. Si cierras sesión ahora se perderá.'
                            : `Hay ${unsent} cantos escritos en este dispositivo que no se pudieron enviar. Si cierras sesión ahora se perderán.`,
                        confirm: 'Cerrar sesión',
                        danger: true,
                    }),
                ).then((done) => {
                    if (done) {
                        options.onSignedOut();
                    }
                });
            };

            const frame = createHeader({
                email: options.email,
                onSync: () => {
                    // With no account the dot says so; there is nothing to sync
                    void data.syncNow({ full: true }).then(() => showToast(data.status().guest ? 'Sin cuenta: tus cantos están solo en este dispositivo' : pullAnswer(data.status().state)));
                },
                onNeedsSignIn: options.onNeedsSignIn,
                onSignUp: options.onSignUp,
            });
            header = frame;
            const view = h('main', { id: 'view' });
            // Pull down to sync now, on every screen of the app (singing included: its swipes are sideways, a pull is down from the top)
            const pull = createPullToRefresh(view, {
                enabled: () => true,
                refresh: async () => {
                    await data.syncNow({ full: true });

                    return data.status().state;
                },
            });
            root.classList.remove('is-gate');
            root.replaceChildren(h('div', { class: 'shell' }, ...frame.top, view, pull, installBanner.element), frame.menu);
            watchBottomChrome([installBanner.element, frame.menu]);
            watchSaves(data);

            data.onStatus(frame.paint);
            frame.paint(data.status());
        },
        markSection: (route) => {
            header?.setRoute(route);
            installBanner.setAway(route.name === 'perform');
        },
        account: () => ({
            email,
            syncText: () => describeSync(data.status()).text,
            onSync: (listener) => data.onStatus((status) => listener(describeSync(status).text)),
            signOut: () => requestSignOut(),
            signIn: () => current?.onNeedsSignIn(),
            signUp: () => current?.onSignUp(),
        }),
    };
}
