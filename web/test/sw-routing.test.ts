import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cacheName, routeFor, staleCaches } from '../src/sw-routing.ts';

const ORIGIN = 'https://lista.example';
const get = (mode: string) => ({ method: 'GET', mode });
const route = (path: string, request = get('no-cors'), origin = ORIGIN) =>
    routeFor(request, new URL(path, origin), ORIGIN);

describe('routeFor', () => {
    it('answers page navigations with the shell, wherever they go', () => {
        assert.equal(route('/', get('navigate')), 'shell');
        assert.equal(route('/listados/3', get('navigate')), 'shell');
    });

    it('serves the app files from the cache', () => {
        assert.equal(route('/assets/main-ABC12345.js'), 'asset');
        assert.equal(route('/manifest.webmanifest'), 'asset');
    });

    it('never touches the API', () => {
        assert.equal(route('/api/me'), 'pass');
        assert.equal(route('/api'), 'pass');
        assert.equal(route('/api/sync', get('navigate')), 'pass');
    });

    it('does not mistake a path that only starts with "api" for the API', () => {
        assert.equal(route('/apiary.png'), 'asset');
    });

    it('ignores requests that change data', () => {
        assert.equal(route('/assets/x.js', { method: 'POST', mode: 'cors' }), 'pass');
    });

    it('ignores other origins', () => {
        assert.equal(route('https://fonts.example/a.woff2', get('no-cors')), 'pass');
    });
});

describe('cache names', () => {
    it('are prefixed so only ours are ever cleaned', () => {
        assert.equal(cacheName('abc'), 'lista-shell-abc');
    });

    it('drops older versions of ours and nothing else', () => {
        const names = ['lista-shell-old', 'lista-shell-new', 'someone-elses', 'workbox-precache'];

        assert.deepEqual(staleCaches(names, 'lista-shell-new'), ['lista-shell-old']);
    });

    it('keeps everything when there is nothing old', () => {
        assert.deepEqual(staleCaches(['lista-shell-new'], 'lista-shell-new'), []);
    });
});
