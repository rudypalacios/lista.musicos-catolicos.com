import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

/** The width and the height a PNG says it has (its header: bytes 16 to 24) */
function pngSize(path: string): string {
    const bytes = readFileSync(new URL(path, root));

    return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

const page = read('web/index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest')) as { icons: { src: string; sizes: string; type: string; purpose?: string }[] };
const build = read('scripts/build.ts');

/** The icons the page and the manifest name: the addresses a phone fetches and keeps */
const linked = [...page.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((found) => found[1] as string);
const declared = manifest.icons.map((icon) => icon.src);

describe('the icons', () => {
    it('are named by the page and by the manifest, and every one is a file of public/', () => {
        assert.equal(linked.length, 3, 'two favicons and the icon of the home screen');
        for (const address of [...linked, ...declared]) {
            assert.ok(existsSync(new URL(`public${address}`, root)), `${address} exists`);
        }
    });

    it('live in a folder with a number, all in the same one, so a new drawing is a new address (a phone keeps an icon by its address for days)', () => {
        const folders = new Set([...linked, ...declared].map((address) => /^\/icons\/(\d+)\//.exec(address)?.[1]));

        assert.equal(folders.size, 1, [...folders].join(', '));
        assert.ok(!folders.has(undefined), 'every icon is under /icons/<number>/');
    });

    it('are kept offline with the app: the shell precaches each address the page and the manifest name', () => {
        for (const address of new Set([...linked, ...declared])) {
            assert.ok(build.includes(`'${address}'`), `${address} is in STATIC_SHELL`);
        }
    });

    it('are as big as the manifest says, and the installed app has a plain and a maskable one of 192 and of 512', () => {
        for (const icon of manifest.icons) {
            assert.equal(pngSize(`public${icon.src}`), icon.sizes, icon.src);
        }
        for (const purpose of ['any', 'maskable']) {
            for (const sizes of ['192x192', '512x512']) {
                assert.ok(manifest.icons.some((icon) => icon.sizes === sizes && icon.purpose === purpose), `${sizes} for ${purpose}`);
            }
        }
    });

    it('are the same drawing at the old addresses, which an old page may still ask for', () => {
        for (const name of ['apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png', 'favicon-16x16.png', 'favicon-32x32.png']) {
            assert.ok(readFileSync(new URL(`public/${name}`, root)).equals(readFileSync(new URL(`public/icons/2/${name}`, root))), name);
        }
    });

    it('are revalidated, whatever the host would otherwise keep (the .htaccess names them with the service worker and the manifest)', () => {
        const htaccess = read('public/.htaccess');

        for (const name of ['apple-touch-icon', 'favicon', 'android-chrome']) {
            assert.ok(htaccess.includes(name), `${name} is in the revalidated files`);
        }
    });
});
