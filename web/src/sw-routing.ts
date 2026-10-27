/**
 * What the service worker does with a request, kept apart from the worker so it can be
 * tested without a browser.
 *
 * - "shell": a page navigation. Answered with the cached app shell, so the app opens with no
 *   network and a deep link or a reload never hits the server for HTML.
 * - "asset": a file of the app (hashed JS and CSS, icons, the manifest). Cache first.
 * - "pass": the browser handles it alone. The API is never cached here: what the app keeps
 *   offline lives in IndexedDB, where it can be synced, versioned and cleaned up.
 */
export type Route = 'shell' | 'asset' | 'pass';

export const SHELL_URL = '/index.html';
export const CACHE_PREFIX = 'lista-shell-';

export function routeFor(request: { method: string; mode: string }, url: URL, origin: string): Route {
    if (request.method !== 'GET' || url.origin !== origin) {
        return 'pass';
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        return 'pass';
    }

    return request.mode === 'navigate' ? 'shell' : 'asset';
}

export function cacheName(version: string): string {
    return CACHE_PREFIX + version;
}

/** The caches this worker no longer needs: ours from older versions, never anyone else's */
export function staleCaches(names: readonly string[], current: string): string[] {
    return names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== current);
}
