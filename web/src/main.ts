import './styles.css';
import { api, ApiError } from './api.ts';
import { h } from './dom.ts';

/**
 * Phase 0 shell: sign in, see that the app opens offline, install it. The setlists arrive
 * in the next phases; this is what proves hosting, HTTPS, the service worker and the
 * install flow on the real devices.
 */

const LAST_USER_KEY = 'lista:last-user';

function rememberUser(email: string | null): void {
    try {
        if (email === null) {
            localStorage.removeItem(LAST_USER_KEY);
        } else {
            localStorage.setItem(LAST_USER_KEY, email);
        }
    } catch {
        // Storage blocked (private mode): the app still works, it just forgets between visits
    }
}

function lastUser(): string | null {
    try {
        return localStorage.getItem(LAST_USER_KEY);
    } catch {
        return null;
    }
}

const root = document.getElementById('app');
if (root === null) {
    throw new Error('Missing #app');
}
const app: HTMLElement = root;

function render(...children: Node[]): void {
    app.replaceChildren(...children);
}

function connectionBadge(): HTMLElement {
    const badge = h('span', { class: 'badge', role: 'status' });
    const update = (): void => {
        const online = navigator.onLine;
        badge.textContent = online ? 'En línea' : 'Sin conexión';
        badge.classList.toggle('badge--offline', !online);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();

    return badge;
}

function header(email: string | null): HTMLElement {
    const bar = h('header', { class: 'bar' }, h('h1', {}, 'Listas'), connectionBadge());
    if (email !== null) {
        const signOut = h('button', { type: 'button', class: 'link' }, 'Salir');
        signOut.addEventListener('click', () => void leave());
        bar.append(h('span', { class: 'who' }, email), signOut);
    }

    return bar;
}

function showSignIn(message = ''): void {
    const email = h('input', {
        id: 'email', name: 'email', type: 'email', autocomplete: 'username', required: true, inputmode: 'email',
    });
    const password = h('input', {
        id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true,
    });
    const error = h('p', { class: 'error', role: 'alert' }, message);
    const submit = h('button', { type: 'submit', class: 'primary' }, 'Entrar');
    const form = h(
        'form',
        { class: 'card', novalidate: true },
        h('h2', {}, 'Inicia sesión'),
        h('label', { for: 'email' }, 'Correo'),
        email,
        h('label', { for: 'password' }, 'Contraseña'),
        password,
        error,
        submit,
    );

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        submit.disabled = true;
        api.login(email.value, password.value)
            .then((me) => {
                rememberUser(me.email);
                showHome(me.email);
            })
            .catch((failure: unknown) => {
                error.textContent =
                    failure instanceof ApiError && failure.isOffline
                        ? 'Necesitas conexión para iniciar sesión.'
                        : failure instanceof Error
                          ? failure.message
                          : 'Algo salió mal.';
                submit.disabled = false;
            });
    });

    render(header(null), h('main', {}, form));
    email.focus();
}

function showHome(email: string): void {
    render(
        header(email),
        h(
            'main',
            {},
            h(
                'section',
                { class: 'card' },
                h('h2', {}, 'Tus listados'),
                h('p', {}, 'Aquí aparecerán tus listados de misa. Esta pantalla ya funciona sin conexión.'),
            ),
        ),
    );
}

async function leave(): Promise<void> {
    try {
        await api.logout();
    } catch {
        // Offline: the cookie stays until the next sign-out, but this device forgets the user
    }
    rememberUser(null);
    showSignIn();
}

async function start(): Promise<void> {
    try {
        const me = await api.me();
        rememberUser(me.email);
        showHome(me.email);
    } catch (failure: unknown) {
        if (failure instanceof ApiError && failure.isOffline) {
            // No network: trust what this device last knew, the server checks when it is back
            const email = lastUser();
            if (email !== null) {
                showHome(email);
            } else {
                render(
                    header(null),
                    h('main', {}, h('p', { class: 'card' }, 'Sin conexión. Conéctate una vez para iniciar sesión.')),
                );
            }
            return;
        }
        rememberUser(null);
        showSignIn();
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

    // Ask the browser to keep this origin's data (setlists later) when it is short of space
    void navigator.storage?.persist?.();
}

registerServiceWorker();
void start();
