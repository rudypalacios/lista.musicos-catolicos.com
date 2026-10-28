/**
 * Browser test of the install guide: a quiet note for Safari on iOS (and only there), the guide
 * itself, and that it opens with no connection.
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
    // Not iOS: no note, but the link to the guide is always there
    const desktop = await (await browser.newContext({ viewport: { width: 820, height: 1180 } })).newPage();
    await signIn(desktop, server.base);
    assert.equal(await desktop.locator('.install-hint').count(), 0);
    await desktop.getByRole('link', { name: '¿Cómo instalar la app en el iPad o el teléfono?' }).click();
    await desktop.getByRole('heading', { name: 'Instalar Lista' }).waitFor();
    assert.match(await desktop.locator('.help').innerText(), /Añadir a pantalla de inicio/);
    pass('the guide is one link away and says how to install on iPad and Android');

    // Safari on an iPad: the note shows, says nothing alarming, and stays closed once closed
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, userAgent: IPAD_SAFARI, hasTouch: true });
    const ipad = await context.newPage();
    await signIn(ipad, server.base);
    await synced(ipad);
    const note = await ipad.locator('.install-hint').innerText();
    assert.match(note, /pantalla de inicio/);
    assert.doesNotMatch(note, /pierd|borr|perd/i, 'the note must not suggest that nothing is being saved');
    await ipad.getByRole('button', { name: 'Ahora no' }).click();
    await ipad.reload();
    await ipad.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.equal(await ipad.locator('.install-hint').count(), 0);
    pass('Safari on iOS gets a calm note that stays closed after "Ahora no"');

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
