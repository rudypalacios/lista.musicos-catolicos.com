import './styles.css';
import './sheet.css';
import { api, ApiError } from './api.ts';
import { App, signOut, type Status } from './app.ts';
import { h, link } from './dom.ts';
import { MASS_PARTS } from './mass.ts';
import { matchRoute, paths, sectionOf, type Route } from './router.ts';
import { showFatal, startUpdates } from './updates.ts';
import { addView } from './views/add.ts';
import { editView } from './views/edit.ts';
import { importView } from './views/import.ts';
import { listView } from './views/list.ts';
import { listsView } from './views/lists.ts';
import { performView } from './views/perform.ts';
import { setlistView } from './views/setlist.ts';
import { signInView } from './views/signin.ts';
import type { Navigate, View } from './views/types.ts';
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
/** The "Cantos | Listados" tabs under the header, once the person is in */
let tabs: HTMLElement | null = null;

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

function describe(status: Status): { text: string; className: string } {
    const unsent = status.pending > 0 ? `${status.pending} sin enviar` : '';
    const refused = status.rejected > 0 ? `${status.rejected} rechazado${status.rejected === 1 ? '' : 's'}` : '';
    const extra = [unsent, refused].filter((part) => part !== '').join(' · ');
    const flag = extra !== '' ? 'sync sync--pending' : 'sync';
    if (!status.durable) {
        return { text: 'Este navegador no guarda datos sin conexión', className: 'sync sync--pending' };
    }
    switch (status.state) {
        case 'syncing':
            return { text: 'Sincronizando…', className: flag };
        case 'offline':
            return { text: extra !== '' ? `Sin conexión · ${extra}` : 'Sin conexión', className: flag };
        case 'signed-out':
            return { text: 'La sesión terminó', className: 'sync sync--pending' };
        case 'error':
            return { text: extra !== '' ? `Error al sincronizar · ${extra}` : 'Error al sincronizar', className: 'sync sync--pending' };
        default:
            return { text: extra !== '' ? extra : 'Sincronizado', className: flag };
    }
}

/** The frame around every screen. Built once per sign-in. */
function mountShell(data: App, email: string, onSignedOut: () => void, onNeedsSignIn: () => void): void {
    const sync = h('span', { class: 'sync', role: 'status', 'aria-live': 'polite' });
    const renew = h('button', { type: 'button', class: 'link', hidden: true }, 'Iniciar sesión');
    renew.addEventListener('click', onNeedsSignIn);
    const out = h('button', { type: 'button', class: 'link' }, 'Salir');
    out.addEventListener('click', () => {
        void signOut(data, (unsent) =>
            confirm(
                unsent === 1
                    ? 'Hay 1 canto escrito en este dispositivo que no se pudo enviar. Si sales ahora se perderá. ¿Salir de todos modos?'
                    : `Hay ${unsent} cantos escritos en este dispositivo que no se pudieron enviar. Si sales ahora se perderán. ¿Salir de todos modos?`,
            ),
        ).then((done) => {
            if (done) {
                onSignedOut();
            }
        });
    });

    const brand = link(paths.list(), 'Listas', 'brand');
    const bar = h('header', { class: 'bar' }, h('h1', {}, brand), sync, renew, h('span', { class: 'who' }, email), out);
    tabs = h(
        'nav',
        { class: 'tabs', 'aria-label': 'Secciones' },
        h('a', { href: paths.list(), 'data-link': true, 'data-section': 'songs' }, 'Cantos'),
        h('a', { href: paths.lists(), 'data-link': true, 'data-section': 'lists' }, 'Listados'),
    );
    app.replaceChildren(bar, tabs, h('main', { id: 'view' }));

    const paint = (status: Status): void => {
        const { text, className } = describe(status);
        sync.textContent = text;
        sync.className = className;
        renew.hidden = status.state !== 'signed-out';
    };
    data.onStatus(paint);
    paint(data.status());
}

/** Marks the tab of the section on screen; while singing a list the tabs give their room to the song */
function markSection(route: Route): void {
    if (tabs === null) {
        return;
    }
    const section = sectionOf(route);
    for (const tab of Array.from(tabs.querySelectorAll('a'))) {
        if (tab.dataset['section'] === section) {
            tab.setAttribute('aria-current', 'page');
        } else {
            tab.removeAttribute('aria-current');
        }
    }
    tabs.hidden = route.name === 'perform';
}

function routeView(data: App, route: Route, navigate: Navigate): Promise<View> {
    switch (route.name) {
        case 'lists':
            return Promise.resolve(listsView(data, navigate));
        case 'setlist':
        case 'add':
        case 'perform':
            return data.setlists.get(route.id).then((setlist) => {
                if (setlist === undefined) {
                    return notice('Este listado no existe (o se eliminó).');
                }
                if (route.name === 'setlist') {
                    return setlistView(data, navigate, setlist);
                }
                if (route.name === 'perform') {
                    return performView(data, navigate, setlist, route.n);
                }
                const part = MASS_PARTS.find((candidate) => candidate.id === route.part);

                return part === undefined ? notice('Esta parte de la misa no existe.') : addView(data, navigate, setlist, part);
            });
        case 'list':
            return Promise.resolve(listView(data));
        case 'new':
            return Promise.resolve(editView(data, navigate));
        case 'import':
            return Promise.resolve(importView(data, navigate));
        case 'view':
        case 'edit':
            return data.get(route.id).then((song) => {
                if (song === undefined) {
                    return notice('Este canto no existe (o se eliminó).');
                }

                return route.name === 'view' ? viewView(data, song) : editView(data, navigate, song);
            });
        default:
            return Promise.resolve(notice('Esta página no existe.'));
    }
}

function runRouter(data: App): void {
    let token = 0;
    const render = (): void => {
        const mine = ++token;
        const route = matchRoute(location.pathname);
        markSection(route);
        void routeView(data, route, navigate).then((view) => {
            if (mine === token) {
                show(view);
            } else {
                view.dispose?.();
            }
        });
    };
    const navigate: Navigate = (path, options) => {
        if (options?.replace === true) {
            history.replaceState(null, '', path);
        } else {
            history.pushState(null, '', path);
        }
        render();
    };

    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-link]');
        if (anchor !== null && anchor.origin === location.origin) {
            event.preventDefault();
            navigate(anchor.pathname + anchor.search);
        }
    });
    window.addEventListener('popstate', render);
    render();
}

let routerStarted = false;

/** Shows the app for a signed-in person (or one whose songs this device holds, when offline) */
function enter(data: App, email: string): void {
    mountShell(
        data,
        email,
        () => void begin(data),
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
    if (document.querySelector('.bar') === null) {
        showFatal(app, event.error ?? event.message);
    }
});
window.addEventListener('unhandledrejection', (event) => {
    if (document.querySelector('.bar') === null) {
        showFatal(app, event.reason);
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
