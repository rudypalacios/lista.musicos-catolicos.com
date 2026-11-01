import './styles.css';
import './sheet.css';
import { api, ApiError } from './api.ts';
import { App, signOut } from './app.ts';
import { h } from './dom.ts';
import { visibleParts } from './data/setlists.ts';
import { sectionsView } from './views/sections.ts';
import { templateView } from './views/template.ts';
import { templatesView } from './views/templates.ts';
import { matchRoute, paths, type Route } from './router.ts';
import { applyReadingColors } from './settings.ts';
import { watchBottomChrome } from './bottom-chrome.ts';
import { createPullToRefresh, pullAnswer } from './pull.ts';
import { describeSync } from './sync-line.ts';
import { showToast, type Toast } from './toast.ts';
import { screenKeeper } from './wakelock.ts';
import { showFatal, startUpdates } from './updates.ts';
import { addView } from './views/add.ts';
import { confirmDialog } from './views/confirm-dialog.ts';
import { createHeader, type Header } from './views/header.ts';
import { editView } from './views/edit.ts';
import { importView } from './views/import.ts';
import { watchInstallPrompt } from './install.ts';
import { createInstallBanner } from './views/install-banner.ts';
import { installView } from './views/install.ts';
import { listView } from './views/list.ts';
import { listsView } from './views/lists.ts';
import { performView } from './views/perform.ts';
import { setlistView } from './views/setlist.ts';
import { settingsView } from './views/settings.ts';
import { signInView } from './views/signin.ts';
import { dismissSheetOnBack } from './views/sheet.ts';
import { askToLeave, leaveIsRisky, setLeaveGuard } from './leave-guard.ts';
import type { Account, Navigate, View } from './views/types.ts';
import { startShared } from './views/shared.ts';
import { viewView } from './views/view.ts';

/**
 * The app: a header, and the screen the address asks for. Everything the person has is on this
 * device first (IndexedDB) and synced when the network allows, so the shell, the songs and the
 * viewer all work with no connection.
 */

const root = document.getElementById('app');
if (root === null) {
    throw new Error('Missing #app');
}
const app: HTMLElement = root;

let current: View | null = null;
/** Who is signed in, for the account block of Ajustes */
let signedInEmail = '';
/** The bar and the menu, once the person is in */
let header: Header | null = null;
/** The "install the app" bar at the bottom, one for the whole page, until the app is installed */
const installBanner = createInstallBanner();
/** Signs out, asking first when something written here was never sent (set once the header exists) */
let requestSignOut: () => void = () => undefined;

function show(view: View): void {
    current?.dispose?.();
    current = view;
    const container = document.getElementById('view');
    if (container === null) {
        app.replaceChildren(view.element);
    } else {
        container.replaceChildren(view.element);
        container.scrollTop = 0;
    }
}

function notice(text: string): View {
    return { element: h('div', { class: 'page' }, h('p', { class: 'card' }, text)) };
}

let savesWatched = false;

/**
 * Everything is saved as it is typed, so there is no "save" button to tell the person it worked:
 * a toast does. It says where the change is ("en este dispositivo") and, once the server has it,
 * that it is synced, so the person knows when the only copy is the one on this device.
 */
function watchSaves(data: App): void {
    if (savesWatched) {
        return;
    }
    savesWatched = true;
    let last: Toast | null = null;
    let waiting = false;
    data.onSaved(() => {
        last = showToast('Guardado en este dispositivo');
        waiting = true;
    });
    data.onStatus((status) => {
        if (waiting && status.state === 'idle' && status.pending === 0) {
            waiting = false;
            last?.update('Guardado y sincronizado');
        }
    });
}

/** The frame around every screen. Built once per sign-in. */
function mountShell(data: App, email: string, onSignedOut: () => void, onNeedsSignIn: () => void): void {
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
                onSignedOut();
            }
        });
    };

    const frame = createHeader({
        email,
        onSync: () => {
            void data.syncNow().then(() => showToast(pullAnswer(data.status().state)));
        },
        onSignOut: () => requestSignOut(),
        onNeedsSignIn,
    });
    header = frame;
    signedInEmail = email;
    const view = h('main', { id: 'view' });
    // Pull down to sync now (not while singing: the stage has its own touches)
    const pull = createPullToRefresh(view, {
        enabled: () => matchRoute(location.pathname).name !== 'perform',
        refresh: async () => {
            await data.syncNow();

            return data.status().state;
        },
    });
    app.replaceChildren(h('div', { class: 'shell' }, ...frame.top, view, pull, installBanner.element), frame.menu);
    watchBottomChrome([installBanner.element, frame.menu]);
    watchSaves(data);

    data.onStatus(frame.paint);
    frame.paint(data.status());
}

/** Shows the bar and the menu that suit the screen; while singing a list they give their room to the song */
function markSection(route: Route): void {
    header?.setRoute(route);
    installBanner.setAway(route.name === 'perform');
}

/** The header's sync line and sign-out, for the screen that puts the header away */
function accountOf(data: App): Account {
    return {
        email: signedInEmail,
        syncText: () => describeSync(data.status()).text,
        onSync: (listener) => data.onStatus((status) => listener(describeSync(status).text)),
        signOut: () => requestSignOut(),
    };
}

function routeView(data: App, route: Route, navigate: Navigate): Promise<View> {
    switch (route.name) {
        case 'lists':
            return Promise.resolve(listsView(data, navigate));
        case 'setlist':
        case 'sections':
        case 'add':
        case 'perform':
            return data.setlists.get(route.id).then((setlist) => {
                if (setlist === undefined) {
                    return notice('Este listado no existe (o se eliminó).');
                }
                if (route.name === 'setlist') {
                    return setlistView(data, navigate, setlist);
                }
                if (route.name === 'sections') {
                    return sectionsView(data, navigate, setlist);
                }
                if (route.name === 'perform') {
                    return performView(data, navigate, setlist, route.n);
                }
                const part = visibleParts(setlist).find((candidate) => candidate.id === route.part);

                return part === undefined ? notice('Esta sección no existe en el listado.') : addView(data, navigate, setlist, part);
            });
        case 'templates':
            return Promise.resolve(templatesView(data, navigate));
        case 'template':
            return data.templates.get(route.id).then((template) =>
                template === undefined ? notice('Esta plantilla no existe (o se eliminó).') : templateView(data, navigate, template));
        case 'install':
            return Promise.resolve(installView());
        case 'settings':
            return Promise.resolve(settingsView(accountOf(data)));
        case 'list':
            return Promise.resolve(listView(data, navigate));
        case 'new':
            return Promise.resolve(editView(data, navigate, undefined, route));
        case 'import':
            return Promise.resolve(importView(data, navigate));
        case 'view':
        case 'edit':
            return data.get(route.id).then((song) => {
                if (song === undefined) {
                    return notice('Este canto no existe (o se eliminó).');
                }

                return route.name === 'view' ? viewView(data, navigate, song) : editView(data, navigate, song, route.back === undefined ? {} : { back: route.back });
            });
        default:
            return Promise.resolve(notice('Esta página no existe.'));
    }
}

/** Puts the screen back where it was, waiting for a view that fills in after it is shown */
function restoreScroll(top: number): void {
    const container = document.getElementById('view');
    if (container === null || top <= 0) {
        return;
    }
    let tries = 0;
    const apply = (): void => {
        container.scrollTop = top;
        if (container.scrollTop < top && ++tries < 8) {
            setTimeout(apply, 100);
        }
    };
    apply();
}

function runRouter(data: App): void {
    let token = 0;
    /** How far each screen was scrolled when the person left it, so "back" returns to the same place */
    const scrolls = new Map<string, number>();
    /** The address of the screen being shown */
    let shown = location.pathname;
    const rememberScroll = (): void => {
        const container = document.getElementById('view');
        if (container !== null) {
            scrolls.set(shown, container.scrollTop);
        }
    };
    const render = (restore: boolean): void => {
        const mine = ++token;
        const route = matchRoute(location.pathname, location.search);
        const path = location.pathname;
        markSection(route);
        void routeView(data, route, navigate).then((view) => {
            if (mine === token) {
                show(view);
                shown = path;
                if (restore) {
                    restoreScroll(scrolls.get(path) ?? 0);
                }
            } else {
                view.dispose?.();
            }
        });
    };
    const navigate: Navigate = (path, options) => {
        rememberScroll();
        if (options?.replace === true) {
            history.replaceState(null, '', path);
        } else {
            history.pushState(null, '', path);
        }
        render(false);
    };

    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-link]');
        if (anchor !== null && anchor.origin === location.origin) {
            event.preventDefault();
            const path = anchor.pathname + anchor.search;
            if (leaveIsRisky()) {
                void askToLeave().then((leave) => leave && navigate(path));
            } else {
                navigate(path);
            }
        }
    });
    window.addEventListener('popstate', () => {
        if (dismissSheetOnBack()) {
            return;
        }
        if (leaveIsRisky()) {
            // The address has already changed: put it back, ask, and only if the person leaves go back for real
            history.pushState(null, '', shown);
            void askToLeave().then((leave) => {
                if (leave) {
                    setLeaveGuard(null);
                    history.back();
                }
            });

            return;
        }
        rememberScroll();
        render(true);
    });
    render(false);
}

let routerStarted = false;

/** Shows the app for a signed-in person (or one whose songs this device holds, when offline) */
function enter(data: App, email: string): void {
    mountShell(
        data,
        email,
        () => {
            // Salir is in Ajustes: whoever signs in next starts from the songs, not from that screen
            history.replaceState(null, '', paths.list());
            void begin(data);
        },
        () => {
            show(signInView((signedIn) => {
                void data.adopt(signedIn).then(() => {
                    enter(data, signedIn);
                    data.resumed();
                });
            }, 'Tu sesión terminó. Inicia sesión para seguir sincronizando; tus cantos siguen aquí.'));
        },
    );
    if (!routerStarted) {
        routerStarted = true;
        runRouter(data);
    } else {
        window.dispatchEvent(new PopStateEvent('popstate'));
    }
}

/**
 * Starts the app. When this device already holds someone's songs it opens from them at once,
 * with no network: whether the session is still good is found out in the background, and a
 * slow or missing connection never keeps the person from their songs. Only a device with nothing
 * on it has to ask the server who is there.
 */
async function begin(data: App): Promise<void> {
    const owner = await data.owner();
    if (owner !== null) {
        enter(data, owner);
        void verifySession(data, owner);

        return;
    }

    app.replaceChildren(
        h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
        h('main', { id: 'view' }, splash('Conectando…')),
        installBanner.element,
    );
    try {
        const me = await api.me();
        await data.adopt(me.email);
        enter(data, me.email);
        data.requestSync(0);
    } catch (failure: unknown) {
        if (failure instanceof ApiError && failure.isOffline) {
            show(notice('Sin conexión. Conéctate una vez para iniciar sesión.'));

            return;
        }
        show(signInView((email) => {
            void data.adopt(email).then(() => {
                enter(data, email);
                data.requestSync(0);
            });
        }));
    }
}

/** The person is already in; ask the server whether that is still true, and sync */
async function verifySession(data: App, owner: string): Promise<void> {
    try {
        const me = await api.me();
        if (me.email !== owner) {
            // Another account signed in on this device elsewhere: its songs replace these
            await data.adopt(me.email);
            enter(data, me.email);
        }
        data.requestSync(0);
    } catch {
        // Offline, a stuck network, or the session ended: syncing reports which, in the header,
        // and the songs on the device stay readable either way
        data.requestSync(0);
    }
}

function splash(text: string): HTMLElement {
    return h('div', { class: 'splash', role: 'status' }, h('span', { class: 'spinner spinner--big', 'aria-hidden': 'true' }), h('p', {}, text));
}

// Whatever goes wrong while starting, say so instead of leaving a blank screen
window.addEventListener('error', (event) => {
    if (document.querySelector('.bar') === null && document.querySelector('.pub') === null) {
        showFatal(app, event.error ?? event.message);
    }
});
window.addEventListener('unhandledrejection', (event) => {
    if (document.querySelector('.bar') === null && document.querySelector('.pub') === null) {
        showFatal(app, event.reason);
    }
});

const visiting = matchRoute(location.pathname);
if (visiting.name === 'shared') {
    // Somebody who was given a link to a list: no account, no data of this device and no sync.
    // The page reads the list from the server, keeps a copy of it apart and shows it (views/shared.ts)
    // It is still this app: the same service worker keeps it (and the list the visitor opened) for reading with no connection
    startUpdates(false);
    startShared(app, visiting.code);
} else {
    applyReadingColors();
    // Chrome's install prompt comes once, soon after load: be listening before anything else is built
    watchInstallPrompt();
    // The browser drops the screen lock whenever the page is hidden: ask again when it is back
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            screenKeeper.resume();
        }
    });
    startUpdates();
    void App.create(() => {
        // Another window still runs the old version and holds the data: say what to do, not just wait
        const waiting = document.querySelector('.splash p');
        if (waiting !== null) {
            waiting.textContent = 'Cierra las demás ventanas de la app para terminar de actualizarla…';
        }
    })
        .then((data) => {
            data.watchConnection();

            return begin(data);
        })
        .catch((error: unknown) => showFatal(app, error));
}
