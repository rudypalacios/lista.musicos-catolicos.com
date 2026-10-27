import './styles.css';
import './sheet.css';
import { api, ApiError } from './api.ts';
import { App, signOut, type Status } from './app.ts';
import { h, link } from './dom.ts';
import { matchRoute, paths, type Route } from './router.ts';
import { editView } from './views/edit.ts';
import { importView } from './views/import.ts';
import { listView } from './views/list.ts';
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
    app.replaceChildren(bar, h('main', { id: 'view' }));

    const paint = (status: Status): void => {
        const { text, className } = describe(status);
        sync.textContent = text;
        sync.className = className;
        renew.hidden = status.state !== 'signed-out';
    };
    data.onStatus(paint);
    paint(data.status());
}

function routeView(data: App, route: Route, navigate: Navigate): Promise<View> {
    switch (route.name) {
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
        void routeView(data, matchRoute(location.pathname), navigate).then((view) => {
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

async function begin(data: App): Promise<void> {
    try {
        const me = await api.me();
        await data.adopt(me.email);
        enter(data, me.email);
        data.requestSync(0);
    } catch (failure: unknown) {
        if (failure instanceof ApiError && failure.isOffline) {
            // No network: trust what this device holds, the server checks when it is back
            const owner = await data.owner();
            if (owner !== null) {
                enter(data, owner);
                data.requestSync(0);
            } else {
                app.replaceChildren(
                    h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
                    h('main', { id: 'view' }, notice('Sin conexión. Conéctate una vez para iniciar sesión.').element),
                );
            }
            return;
        }
        app.replaceChildren(
            h('header', { class: 'bar' }, h('h1', {}, 'Listas')),
            h('main', { id: 'view' }),
        );
        show(signInView((email) => {
            void data.adopt(email).then(() => {
                enter(data, email);
                data.requestSync(0);
            });
        }));
    }
}

function offerUpdate(worker: ServiceWorker): void {
    const button = h('button', { type: 'button', class: 'primary' }, 'Actualizar');
    const banner = h('div', { class: 'update', role: 'status' }, h('span', {}, 'Hay una versión nueva. '), button);
    button.addEventListener('click', () => worker.postMessage('skip-waiting'));
    document.body.append(banner);
}

function registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Only after the person accepted an update, never on the very first install
        if (!reloading && document.querySelector('.update') !== null) {
            reloading = true;
            location.reload();
        }
    });

    navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
            if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
                offerUpdate(registration.waiting);
            }
            registration.addEventListener('updatefound', () => {
                const installing = registration.installing;
                installing?.addEventListener('statechange', () => {
                    if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
                        offerUpdate(installing);
                    }
                });
            });
        })
        .catch(() => {
            // Without a worker the app still runs online; there is nothing to tell the person
        });

    // Ask the browser to keep this origin's data (the songs) when it is short of space
    void navigator.storage?.persist?.();
}

registerServiceWorker();
void App.create().then((data) => {
    data.watchConnection();
    return begin(data);
});
