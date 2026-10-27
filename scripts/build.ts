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

// The PDF reader's worker is its own file: the app needs to know its URL, so it is built first
const worker = await build({
    entryPoints: { 'pdf-worker': join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs') },
    outdir: join(publicDir, 'assets'),
    entryNames: '[name]-[hash]',
    bundle: true,
    minify: true,
    format: 'esm',
    target: ['es2022', 'safari15'],
    metafile: true,
    logLevel: 'info',
});
const workerFile = Object.keys(worker.metafile.outputs)[0];
if (workerFile === undefined) {
    throw new Error('The PDF worker was not built');
}
const workerUrl = '/' + relative(publicDir, join(root, workerFile));

const app = await build({
    entryPoints: { main: join(root, 'web/src/main.ts') },
    outdir: join(publicDir, 'assets'),
    entryNames: '[name]-[hash]',
    // The PDF reader is a separate chunk, fetched only when a PDF is chosen (and not precached)
    chunkNames: 'chunk-[hash]',
    splitting: true,
    bundle: true,
    minify: true,
    format: 'esm',
    // Safari 15 (iPads that do not update) is the oldest browser this has to run on
    target: ['es2022', 'safari15'],
    define: { __PDF_WORKER_URL__: JSON.stringify(workerUrl) },
    metafile: true,
    logLevel: 'info',
});

// What the page loads at once: main's script, every chunk it imports statically (code shared with
// the lazy parts ends up in chunks), and the one stylesheet. What loads on demand (the PDF reader
// and its worker) is not precached: it is only needed to import, which wants a connection anyway.
const outputs = app.metafile.outputs;
const mainPath = Object.keys(outputs).find((path) => path.endsWith('.js') && outputs[path]?.entryPoint?.endsWith('main.ts') === true);
const cssPath = Object.keys(outputs).find((path) => path.endsWith('.css'));
if (mainPath === undefined || cssPath === undefined) {
    throw new Error('The bundle must produce main\'s script and a stylesheet, got: ' + Object.keys(outputs).join(', '));
}
const loaded = new Set<string>();
const visit = (path: string): void => {
    if (loaded.has(path)) {
        return;
    }
    loaded.add(path);
    for (const edge of outputs[path]?.imports ?? []) {
        if (edge.kind === 'import-statement' && outputs[edge.path] !== undefined) {
            visit(edge.path);
        }
    }
};
visit(mainPath);
const toUrl = (path: string): string => '/' + relative(publicDir, join(root, path));
const js = toUrl(mainPath);
const css = toUrl(cssPath);
const scripts = [...loaded].map(toUrl);

// LISTA_BUILD_NOTE changes the page and so the shell's version: the update test builds twice with it
const note = process.env['LISTA_BUILD_NOTE'];
const html =
    readFileSync(join(root, 'web/index.html'), 'utf8').replace('%JS%', js).replace('%CSS%', css) +
    (note !== undefined ? `<!-- build: ${note.replace(/[^\w .-]/g, '')} -->\n` : '');
writeFileSync(join(publicDir, 'index.html'), html);

const shellUrls = ['/index.html', ...scripts, css, ...STATIC_SHELL];
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
