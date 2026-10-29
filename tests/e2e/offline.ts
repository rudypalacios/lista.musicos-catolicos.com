/**
 * Browser test of the phase-0 promise, still the base of everything: sign in, close the
 * connection, reload, and the app still opens. Runs the real PHP server on a throwaway SQLite
 * database and drives Chromium (Playwright) the way an installed PWA behaves.
 *
 *     npm run build && npm run e2e
 *
 * Not part of the CI: it is run locally (here, by Claude) before a commit that touches the
 * shell, the service worker or the API. Safari/WebKit is not covered; that is checked by
 * hand on the iPad (see DEPLOY.md).
 */
import assert from 'node:assert/strict';
import { accountMenu, chromium, EMAIL, PASSWORD, reporter, startServer } from './lib.ts';

const server = await startServer(18080);
const { pass, count } = reporter();
const BASE = server.base;

const browser = await chromium.launch();
try {
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
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
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

    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    await page.getByText('Sin conexión').first().waitFor();
    pass('offline: the app reopens signed in, with the offline status');

    await page.goto(BASE + '/cantos/nuevo');
    await page.getByRole('heading', { name: 'Nuevo canto' }).waitFor();
    pass('offline: a deep link opens the shell and its screen');

    await context.setOffline(false);
    await page.goto(BASE + '/');
    await accountMenu(page, 'Salir');
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    pass('back online: signing out returns to the sign-in form');

    const manifest = (await (await fetch(BASE + '/manifest.webmanifest')).json()) as { display: string; icons: unknown[] };
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.icons.length, 2);
    pass('the manifest is installable (standalone, icons)');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no uncaught errors in the page');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
