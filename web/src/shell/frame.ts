import { signOut, type App } from '../app.ts';
import { h } from '../dom.ts';
import { watchBottomChrome } from '../bottom-chrome.ts';
import { createPullToRefresh, pullAnswer } from '../pull.ts';
import { matchRoute, type Route } from '../router.ts';
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
    /** Whether anyone can create an account now (asked again whenever the header paints) */
    canSignUp: () => boolean;
}

/** The bar, the menu and the area under them that the screens fill */
export interface Frame {
    /** Builds the frame for the person in `options`; built again when somebody else signs in */
    mount: (options: FrameOptions) => void;
    /** Shows the bar and the menu that suit the screen; while singing a list they give their room to the song */
    markSection: (route: Route) => void;
    /** The header's sync line and sign-out, for the screen that puts the header away (Ajustes, singing) */
    account: () => Account;
    /** Paints the header again (something it says changed outside the sync: whether sign-up is open) */
    repaint: () => void;
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
                void signOut(data, (unsent) =>
                    confirmDialog({
                        title: '¿Salir de todos modos?',
                        text: unsent === 1
                            ? 'Hay 1 canto escrito en este dispositivo que no se pudo enviar. Si sales ahora se perderá.'
                            : `Hay ${unsent} cantos escritos en este dispositivo que no se pudieron enviar. Si sales ahora se perderán.`,
                        confirm: 'Salir',
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
                    void data.syncNow().then(() => showToast(data.status().guest ? 'Sin cuenta: tus cantos están solo en este dispositivo' : pullAnswer(data.status().state)));
                },
                onSignOut: () => requestSignOut(),
                onNeedsSignIn: options.onNeedsSignIn,
                onSignUp: options.onSignUp,
                canSignUp: options.canSignUp,
            });
            header = frame;
            const view = h('main', { id: 'view' });
            // Pull down to sync now (not while singing: the stage has its own touches)
            const pull = createPullToRefresh(view, {
                enabled: () => matchRoute(location.pathname).name !== 'perform',
                refresh: async () => {
                    await data.syncNow();

                    return data.status().state;
                },
            });
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
            canSignUp: () => current?.canSignUp() ?? false,
        }),
        repaint: () => header?.paint(data.status()),
    };
}
