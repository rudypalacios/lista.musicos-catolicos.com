/**
 * Browser test of the install offer: a bar at the bottom on every visit until the app is installed
 * (Chrome's own dialog where it can be opened, the steps for Safari on iOS), the guide itself, and
 * that it opens with no connection.
 *
 *     npm run build && node tests/e2e/install.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer, synced } from './lib.ts';

const server = await startServer(18092);
const { pass, count } = reporter();
const IPAD_SAFARI =
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch();
try {
    // A desktop browser that gave no install prompt: no bar, but the link to the guide is always there
    const desktop = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
    await signIn(desktop, server.base);
    assert.equal(await desktop.locator('.install-banner').isVisible(), false);
    await desktop.getByRole('link', { name: '¿Cómo instalar la app en el iPad o el teléfono?' }).click();
    await desktop.getByRole('heading', { name: 'Instalar Lista' }).waitFor();
    assert.match(await desktop.locator('.help').innerText(), /Añadir a pantalla de inicio/);
    pass('the guide is one link away and says how to install on iPad and Android');

    // Safari on an iPad: the bar gives the steps, says nothing alarming, and is back on the next visit
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, userAgent: IPAD_SAFARI, hasTouch: true });
    const ipad = await context.newPage();
    await signIn(ipad, server.base);
    await synced(ipad);
    const note = await ipad.locator('.install-banner').innerText();
    assert.match(note, /pantalla de inicio/);
    assert.doesNotMatch(note, /pierd|borr|perd/i, 'the note must not suggest that nothing is being saved');
    await ipad.getByRole('link', { name: 'Cómo instalar', exact: true }).waitFor();
    await ipad.getByRole('button', { name: 'Ahora no' }).click();
    assert.equal(await ipad.locator('.install-banner').isVisible(), false);
    await ipad.reload();
    await ipad.getByRole('heading', { name: 'Cantos' }).waitFor();
    await ipad.locator('.install-banner').waitFor();
    pass('Safari on iOS gets the steps on every visit; "Ahora no" is for this visit only');

    // Chrome: its install prompt is held and opened by the bar's button
    const chrome = await (await browser.newContext({ viewport: { width: 412, height: 860 } })).newPage();
    await chrome.addInitScript(() => {
        (window as unknown as { __asked: number }).__asked = 0;
        window.addEventListener('load', () => {
            const event = new Event('beforeinstallprompt', { cancelable: true });
            Object.assign(event, {
                prompt: () => {
                    (window as unknown as { __asked: number }).__asked++;

                    return Promise.resolve();
                },
                userChoice: Promise.resolve({ outcome: 'dismissed' }),
            });
            setTimeout(() => window.dispatchEvent(event), 300);
        });
    });
    await signIn(chrome, server.base);
    await chrome.getByRole('button', { name: 'Instalar', exact: true }).waitFor();
    assert.equal(await chrome.getByRole('link', { name: 'Cómo instalar', exact: true }).isVisible(), false);
    await chrome.getByRole('button', { name: 'Instalar', exact: true }).click();
    await chrome.locator('.install-banner').waitFor({ state: 'hidden' });
    assert.equal(await chrome.evaluate(() => (window as unknown as { __asked: number }).__asked), 1, 'the browser dialog was opened');
    await chrome.reload();
    await chrome.getByRole('button', { name: 'Instalar', exact: true }).waitFor();
    pass('Chrome: the bar opens its install dialog, and offers it again on the next visit');

    // Once installed, it is gone
    await chrome.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await chrome.locator('.install-banner').waitFor({ state: 'hidden' });
    pass('the bar goes away when the app gets installed');

    // With no connection the guide still opens (it is part of the app shell)
    await ipad.waitForFunction(async () => (await caches.keys()).length > 0);
    await context.setOffline(true);
    await ipad.goto(`${server.base}/ayuda/instalar`);
    await ipad.getByRole('heading', { name: 'Instalar Lista' }).waitFor();
    pass('the guide opens with no connection');
} finally {
    await browser.close();
    server.stop();
}

console.log(`\n${count()} checks passed`);
