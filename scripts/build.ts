/**
 * Builds the app into public/: hashed JS and CSS in public/assets/, index.html from the
 * template, and the service worker (public/sw.js) with the list of files to precache.
 * public/ is the web root, so the deploy uploads what this leaves there.
 */
import { build } from 'esbuild';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shellVersion, type ShellFile } from './precache.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

/** Static files in public/ the app needs offline, besides what the build produces */
const STATIC_SHELL = [
    '/manifest.webmanifest',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',
    '/android-chrome-192x192.png',
    '/android-chrome-512x512.png',
];

rmSync(join(publicDir, 'assets'), { recursive: true, force: true });
rmSync(join(publicDir, 'index.html'), { force: true });
rmSync(join(publicDir, 'sw.js'), { force: true });

const app = await build({
    entryPoints: { main: join(root, 'web/src/main.ts') },
    outdir: join(publicDir, 'assets'),
    entryNames: '[name]-[hash]',
    bundle: true,
    minify: true,
    format: 'esm',
    // Safari 15 (iPads that do not update) is the oldest browser this has to run on
    target: ['es2022', 'safari15'],
    metafile: true,
    logLevel: 'info',
});

const outputs = Object.keys(app.metafile.outputs).map((path) => '/' + relative(publicDir, join(root, path)));
const js = outputs.find((url) => url.endsWith('.js'));
const css = outputs.find((url) => url.endsWith('.css'));
if (js === undefined || css === undefined) {
    throw new Error('The bundle must produce one JS and one CSS file, got: ' + outputs.join(', '));
}

const html = readFileSync(join(root, 'web/index.html'), 'utf8').replace('%JS%', js).replace('%CSS%', css);
writeFileSync(join(publicDir, 'index.html'), html);

const shellUrls = ['/index.html', js, css, ...STATIC_SHELL];
const files: ShellFile[] = shellUrls.map((url) => ({ url, content: readFileSync(join(publicDir, url)) }));
const version = shellVersion(files);

await build({
    entryPoints: [join(root, 'web/src/sw.ts')],
    outfile: join(publicDir, 'sw.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2022', 'safari15'],
    define: {
        __PRECACHE__: JSON.stringify(shellUrls),
        __SHELL_VERSION__: JSON.stringify(version),
    },
    logLevel: 'info',
});

console.log(`Shell ${version}: ${shellUrls.length} files to precache`);
