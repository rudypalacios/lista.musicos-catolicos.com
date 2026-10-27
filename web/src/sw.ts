/// <reference lib="webworker" />
import { cacheName, routeFor, SHELL_URL, staleCaches } from './sw-routing.ts';

declare const self: ServiceWorkerGlobalScope;

const CURRENT = cacheName(__SHELL_VERSION__);

self.addEventListener('install', (event) => {
    // No skipWaiting() here: a new version waits until the person accepts it
    // ("Hay una versión nueva"), so the app never changes under them in the middle of a song.
    event.waitUntil(caches.open(CURRENT).then((cache) => cache.addAll([...__PRECACHE__])));
});

self.addEventListener('message', (event) => {
    if (event.data === 'skip-waiting') {
        void self.skipWaiting();
    }
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(staleCaches(names, CURRENT).map((name) => caches.delete(name)));
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('fetch', (event) => {
    const route = routeFor(event.request, new URL(event.request.url), self.location.origin);
    if (route === 'pass') {
        return;
    }

    event.respondWith(
        (async () => {
            const cache = await caches.open(CURRENT);
            const cached = await cache.match(route === 'shell' ? SHELL_URL : event.request);
            // Offline-first: the cache answers, the network only fills what is missing
            return cached ?? fetch(event.request);
        })(),
    );
});
