/**
 * Browser test of the phase-0 promise: sign in, close the connection, reload, and the app
 * still opens. Runs the real PHP server on a throwaway SQLite database and drives Chromium
 * (Playwright) the way an installed PWA behaves.
 *
 *     npm run build && npm run e2e
 *
 * Not part of the CI: it is run locally (here, by Claude) before a commit that touches the
 * shell, the service worker or the API. Safari/WebKit is not covered; that is checked by
 * hand on the iPad (see DEPLOY.md).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Playwright is installed globally in the dev container, not in package.json (it would
// download browsers on every install). CommonJS resolution honours NODE_PATH; import does not.
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const PORT = 18080;
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = 'owner@example.com';
const PASSWORD = 'correct horse battery';

const dir = mkdtempSync(join(tmpdir(), 'lista-e2e-'));
const server = spawn(
    'php',
    ['-d', 'variables_order=EGPCS', '-S', `127.0.0.1:${PORT}`, '-t', 'public', 'public/index.php'],
    {
        env: {
            ...process.env,
            APP_ENV: 'development',
            DB_DRIVER: 'sqlite',
            DB_PATH: join(dir, 'e2e.sqlite'),
            OWNER_EMAIL: EMAIL,
            OWNER_PASSWORD: PASSWORD,
        },
        stdio: 'ignore',
    },
);

async function waitForServer(): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            if ((await fetch(`${BASE}/api/health`)).ok) {
                return;
            }
        } catch {
            // not listening yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('The PHP server did not start');
}

const results: string[] = [];
function pass(name: string): void {
    results.push(name);
    console.log('  ok  ' + name);
}

try {
    await waitForServer();
    const browser = await chromium.launch();
    // An iPad in portrait, the main device
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    await page.goto(BASE + '/');
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    pass('the shell opens and asks to sign in');

    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill('wrong');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByText('Correo o contraseña incorrectos.').waitFor();
    pass('a wrong password shows the Spanish error');

    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('heading', { name: 'Tus listados' }).waitFor();
    pass('the right password signs in');

    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
    assert.equal(controlled, true, 'the service worker controls the page after a reload');
    pass('the service worker is installed and in control');

    const cacheNames = await page.evaluate(() => caches.keys());
    assert.equal(cacheNames.length, 1);
    assert.match(cacheNames[0] ?? '', /^lista-shell-[0-9a-f]{12}$/);
    pass('one shell cache, named after the build');

    const persisted = await page.evaluate(() => navigator.storage.persisted());
    console.log(`      (storage persisted: ${persisted}; Chromium decides, it is not asserted)`);

    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Tus listados' }).waitFor();
    await page.getByText('Sin conexión').first().waitFor();
    pass('offline: the app reopens signed in, with the offline badge');

    await page.goto(BASE + '/listados/algun-dia');
    await page.getByRole('heading', { name: 'Tus listados' }).waitFor();
    pass('offline: a deep link opens the shell too');

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    pass('back online: signing out returns to the sign-in form');

    const manifest = (await (await fetch(BASE + '/manifest.webmanifest')).json()) as { display: string; icons: unknown[] };
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.icons.length, 2);
    pass('the manifest is installable (standalone, icons)');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no uncaught errors in the page');

    await browser.close();
    console.log(`\n${results.length} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    server.kill();
    rmSync(dir, { recursive: true, force: true });
}
