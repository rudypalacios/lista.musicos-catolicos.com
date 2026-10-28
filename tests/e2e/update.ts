/**
 * Browser test of how the app starts and updates, from the person's side: it must never leave a
 * blank screen, and an update must say what it is doing at every step.
 *
 *     npm run build && node tests/e2e/update.ts
 *
 * It rebuilds the app while running (LISTA_BUILD_NOTE makes the second build a different version)
 * and leaves the working copy built without the note.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chromium, reporter, signIn, startServer, synced } from './lib.ts';

const build = (note?: string): void => {
    execFileSync('node', ['scripts/build.ts'], {
        env: note === undefined ? { ...process.env, LISTA_BUILD_NOTE: '' } : { ...process.env, LISTA_BUILD_NOTE: note },
        stdio: 'ignore',
    });
};

build('one');
const server = await startServer(18085);
const { pass, count } = reporter();
const browser = await chromium.launch();

try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    // Chrome offers to install: the install bar is on screen when the update arrives
    await context.addInitScript(() => {
        window.addEventListener('load', () => {
            const event = new Event('beforeinstallprompt', { cancelable: true });
            Object.assign(event, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });
            setTimeout(() => window.dispatchEvent(event), 300);
        });
    });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    const html = await (await fetch(server.base + '/')).text();
    assert.match(html, /class="splash"/);
    pass('the page carries a splash, so a slow start is never blank');

    await signIn(page, server.base);
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill('Canto que debe sobrevivir');
    await page.getByLabel('Letra con acordes').fill('[C]Una línea');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Canto que debe sobrevivir' }).waitFor();
    await synced(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null), true);

    // ----- starting with a network that never answers -----
    await context.route('**/api/me', () => undefined); // the request hangs: no answer, no error
    await page.reload();
    await page.getByRole('link', { name: '← Cantos' }).waitFor({ timeout: 5000 });
    pass('a /api/me that never answers does not blank the app: it opens from the device');

    await page.getByRole('link', { name: '← Cantos' }).click();
    await page.getByRole('link', { name: 'Canto que debe sobrevivir' }).waitFor();
    pass('and the songs are there');

    // ----- an update that applies -----
    build('two');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration?.update()));
    await page.getByText('Hay una versión nueva').waitFor({ timeout: 15000 });
    pass('a new version is announced');

    // The notice to update is on top of the install bar, never behind it: the button takes the tap
    assert.equal(await page.evaluate(() => {
        const box = (document.querySelector('.update button') as HTMLElement).getBoundingClientRect();

        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('.update') !== null;
    }), true, 'the Actualizar button is the topmost thing at its place');
    assert.equal(await page.locator('.install-banner').isVisible(), false, 'the install offer waits while a version is to be accepted');
    pass('the update notice sits above the install bar and the bar steps aside');

    await page.getByRole('button', { name: 'Actualizar' }).click();
    await page.getByText('Actualizando la app…').waitFor({ timeout: 3000 });
    pass('accepting it shows "Actualizando la app…" at once, not a frozen screen');

    await page.getByText('✓ App actualizada').waitFor({ timeout: 15000 });
    await page.getByRole('link', { name: 'Canto que debe sobrevivir' }).waitFor();
    const cacheNames = await page.evaluate(() => caches.keys());
    assert.equal(cacheNames.length, 1, 'the old copy of the app is gone');
    pass('the app reloads on the new version, says so, and keeps its songs');

    // ----- an update that does not apply -----
    build('three');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration?.update()));
    await page.getByText('Hay una versión nueva').waitFor({ timeout: 15000 });
    await page.evaluate(() => {
        // The worker does not hear the message: the update cannot apply
        const original = ServiceWorker.prototype.postMessage;
        ServiceWorker.prototype.postMessage = () => undefined;
        (globalThis as unknown as { restoreWorker: () => void }).restoreWorker = () => {
            ServiceWorker.prototype.postMessage = original;
        };
    });
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await page.getByText('Actualizando la app…').waitFor();
    await page.getByText('La actualización está tardando más de lo normal.').waitFor({ timeout: 15000 });
    pass('an update that does not apply says so instead of hanging');

    await page.evaluate(() => (globalThis as unknown as { restoreWorker: () => void }).restoreWorker());
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.getByText('✓ App actualizada').waitFor({ timeout: 15000 });
    pass('and "Reintentar" gets it through');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no uncaught errors in the page');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
    build();
}
