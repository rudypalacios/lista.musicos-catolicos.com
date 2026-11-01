/**
 * New versions of the app, from the person's side. The service worker downloads a new version in
 * the background and waits; this tells them what is happening at every step (downloading, ready,
 * applying) so the app never seems to freeze or go blank, and gives a way out when an update
 * does not apply.
 *
 *   found → "Descargando la versión nueva…"
 *   installed → "Hay una versión nueva" [Actualizar]
 *   accepted → a full-screen "Actualizando…" until the page reloads on the new version
 *   (no answer after a few seconds) → "La actualización tarda" [Reintentar] [Reiniciar la app]
 *   after the reload → "App actualizada" for a moment
 */
import { icon } from './icons.ts';
import { h } from './dom.ts';

export type UpdateState =
    | { kind: 'none' }
    | { kind: 'downloading' }
    | { kind: 'ready' }
    | { kind: 'applying' }
    | { kind: 'stuck' };

export type UpdateEvent = 'found' | 'installed' | 'redundant' | 'accepted' | 'timeout' | 'retry';

/** What happens to the update state when something does; pure, so every path is tested */
export function nextUpdateState(state: UpdateState, event: UpdateEvent): UpdateState {
    switch (event) {
        case 'found':
            // A newer version supersedes whatever was ready or stuck; while applying, let it finish
            return state.kind === 'applying' ? state : { kind: 'downloading' };
        case 'installed':
            return state.kind === 'downloading' ? { kind: 'ready' } : state;
        case 'redundant':
            // The worker we were waiting on vanished: nothing to apply, unless we were applying it
            return state.kind === 'applying' ? { kind: 'stuck' } : { kind: 'none' };
        case 'accepted':
            return state.kind === 'ready' ? { kind: 'applying' } : state;
        case 'timeout':
            return state.kind === 'applying' ? { kind: 'stuck' } : state;
        case 'retry':
            return state.kind === 'stuck' ? { kind: 'applying' } : state;
    }
}

const JUST_UPDATED = 'lista:updated';
/** How long an accepted update may take before we say it is taking long */
const APPLY_TIMEOUT_MS = 8000;
/** The "updating" screen stays up at least this long: gone in a blink, it would look like a glitch */
const MIN_SHOWN_MS = 900;
/** How often an open app asks whether there is a new version */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * @param keepData ask the browser to keep this origin's data when it is short of space (the person's songs). A visitor of a
 *     shared list has none to keep, so the page does not ask: some browsers show a question for it.
 */
export function startUpdates(keepData = true): void {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const container = h('div', { class: 'update-ui' });
    document.body.append(container);

    let state: UpdateState = { kind: 'none' };
    let waiting: ServiceWorker | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let reloading = false;
    let acceptedAt = 0;

    const dispatch = (event: UpdateEvent): void => {
        const before = state;
        state = nextUpdateState(state, event);
        if (state.kind !== before.kind) {
            draw();
            if (state.kind === 'applying') {
                timer = setTimeout(() => dispatch('timeout'), APPLY_TIMEOUT_MS);
            } else if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        }
    };

    const apply = (): void => {
        // Reaching a waiting worker that is gone (the page stayed open across two deploys) fails quietly
        waiting?.postMessage('skip-waiting');
        void registration?.update().catch(() => undefined);
    };

    const accept = (): void => {
        acceptedAt = Date.now();
        dispatch('accepted');
        apply();
    };

    const retry = (): void => {
        dispatch('retry');
        apply();
    };

    const draw = (): void => {
        switch (state.kind) {
            case 'none':
                container.replaceChildren();
                break;
            case 'downloading':
                container.replaceChildren(
                    h('div', { class: 'toast', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Descargando la versión nueva…'),
                );
                break;
            case 'ready': {
                const button = h('button', { type: 'button', class: 'primary' }, 'Actualizar');
                button.addEventListener('click', accept);
                container.replaceChildren(
                    h('div', { class: 'update', role: 'status' }, h('span', {}, 'Hay una versión nueva. '), button),
                );
                break;
            }
            case 'applying':
                container.replaceChildren(
                    h(
                        'div',
                        { class: 'overlay', role: 'alert' },
                        h('span', { class: 'spinner spinner--big', 'aria-hidden': 'true' }),
                        h('p', {}, 'Actualizando la app…'),
                        h('p', { class: 'help' }, 'Tus cantos están a salvo. No cierres esta pantalla.'),
                    ),
                );
                break;
            case 'stuck': {
                const again = h('button', { type: 'button', class: 'primary' }, 'Reintentar');
                again.addEventListener('click', retry);
                const reset = h('button', { type: 'button', class: 'button' }, 'Reiniciar la app');
                reset.addEventListener('click', () => void resetApp());
                container.replaceChildren(
                    h(
                        'div',
                        { class: 'overlay', role: 'alert' },
                        h('p', {}, 'La actualización está tardando más de lo normal.'),
                        h('p', { class: 'help' }, 'Reintentar casi siempre basta. “Reiniciar la app” borra la copia de la app y la vuelve a descargar (necesita conexión); tus cantos no se tocan.'),
                        h('div', { class: 'actions' }, again, reset),
                    ),
                );
                break;
            }
        }
    };

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Only after the person accepted an update, never on the very first install
        if (state.kind === 'applying' && !reloading) {
            reloading = true;
            try {
                sessionStorage.setItem(JUST_UPDATED, '1');
            } catch {
                // No storage: the update still applies, only the "updated" note is lost
            }
            setTimeout(() => location.reload(), Math.max(0, MIN_SHOWN_MS - (Date.now() - acceptedAt)));
        }
    });

    const watch = (installing: ServiceWorker): void => {
        dispatch('found');
        installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller !== null) {
                waiting = installing;
                dispatch('installed');
            } else if (installing.state === 'redundant') {
                dispatch('redundant');
            }
        });
    };

    navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
            registration = reg;
            if (reg.waiting !== null && navigator.serviceWorker.controller !== null) {
                waiting = reg.waiting;
                state = { kind: 'ready' };
                draw();
            } else if (reg.installing !== null && navigator.serviceWorker.controller !== null) {
                watch(reg.installing);
            }
            reg.addEventListener('updatefound', () => {
                if (reg.installing !== null && navigator.serviceWorker.controller !== null) {
                    watch(reg.installing);
                }
            });
            // An app left open on a stand all week still finds out
            const check = (): void => {
                if (document.visibilityState === 'visible' && navigator.onLine) {
                    void reg.update().catch(() => undefined);
                }
            };
            document.addEventListener('visibilitychange', check);
            setInterval(check, CHECK_EVERY_MS);
        })
        .catch(() => {
            // Without a worker the app still runs online; there is nothing to tell the person
        });

    // Ask the browser to keep this origin's data (the songs) when it is short of space
    if (keepData) {
        void navigator.storage?.persist?.();
    }

    try {
        if (sessionStorage.getItem(JUST_UPDATED) === '1') {
            sessionStorage.removeItem(JUST_UPDATED);
            const note = h('div', { class: 'toast toast--done', role: 'status' }, icon('check', 18), ' App actualizada');
            container.append(note);
            setTimeout(() => note.remove(), 3500);
        }
    } catch {
        // No storage: no note
    }
}

/**
 * The way out when the app itself is wedged: forget the worker and the app's cached copy and load
 * it again. Songs live in IndexedDB, which this does not touch. Needs a connection: the copy that
 * would load offline is the one being deleted.
 */
export async function resetApp(): Promise<void> {
    if (!navigator.onLine) {
        alert('Para reiniciar la app necesitas conexión: se vuelve a descargar. Tus cantos no se tocan.');
        return;
    }
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith('lista-shell-')).map((name) => caches.delete(name)));
    } finally {
        location.reload();
    }
}

/** A screen that explains instead of staying blank when the app cannot start */
export function showFatal(root: HTMLElement, error: unknown): void {
    const reload = h('button', { type: 'button', class: 'primary' }, 'Recargar');
    reload.addEventListener('click', () => location.reload());
    const reset = h('button', { type: 'button', class: 'button' }, 'Reiniciar la app');
    reset.addEventListener('click', () => void resetApp());
    root.replaceChildren(
        h(
            'div',
            { class: 'page' },
            h('h2', {}, 'No se pudo abrir la app'),
            h('p', {}, 'Algo falló al iniciar. Recargar suele arreglarlo; si no, “Reiniciar la app” la descarga de nuevo. Tus cantos no se tocan.'),
            h('div', { class: 'actions' }, reload, reset),
            h('p', { class: 'help' }, error instanceof Error ? error.message : String(error)),
        ),
    );
}
