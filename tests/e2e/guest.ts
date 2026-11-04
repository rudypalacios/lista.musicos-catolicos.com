/**
 * Browser test of trying the app with no account: a device with nothing on it opens on the welcome (the app is not behind
 * a login), the person writes songs that stay on the device, nothing is sent, and signing in asks what to do with what they
 * wrote: add it to the account or drop it (cancelling changes nothing).
 *
 *     npm run build && node tests/e2e/guest.ts
 */
import assert from 'node:assert/strict';
import { chromium, EMAIL, openSection, PASSWORD, reporter, signIn, startServer } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18200);
const { pass, count } = reporter();
const browser = await chromium.launch();

const MINE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** A song written from the screen, as a person does */
async function createSong(page: Page, title: string, body: string): Promise<void> {
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Letra con acordes').fill(body);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

/** The titles of the songs the server holds for the account that is signed in on `page` */
async function serverSongs(page: Page): Promise<string[]> {
    return page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as { songs: { title: string; deleted?: boolean }[] };

        return answer.songs.map((song) => song.title).sort();
    });
}

/** Opens the sign-in form from the guest's app and signs in as the account */
async function signInFromTheApp(page: Page): Promise<void> {
    // The guest's line offers to create an account; signing in is in Ajustes
    await openSection(page, 'Ajustes');
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
}

try {
    // ----- the account already has a song, made on another device -----
    const owner = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' })).newPage();
    await signIn(owner, server.base);
    await owner.evaluate(async () => {
        await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                songs: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', title: 'De mi cuenta', author: '', body: '[C]Cuenta', updatedAt: 1_700_000_000_000, deleted: false }],
                setlists: [],
            }),
        });
    });

    // ----- a device with nothing on it opens on the welcome -----
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    const sent: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname === '/api/sync') {
            sent.push(url.pathname);
        }
    });
    await page.goto(server.base + '/');
    await page.getByRole('button', { name: 'Probar sin cuenta' }).waitFor();
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).waitFor();
    await page.getByText('Sin cuenta, lo que escribas se guarda solo en este dispositivo').waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Inicia sesión' }).count(), 0, 'the app is not behind a login');
    pass('a device with nothing on it opens on the welcome: try with no account, or sign in');

    // "Ya tengo cuenta" shows the form and "Volver" goes back to the welcome
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    await page.getByRole('button', { name: 'Volver' }).click();
    await page.getByRole('button', { name: 'Probar sin cuenta' }).waitFor();
    pass('the sign-in form has a way back to the welcome');

    // ----- trying the app -----
    await page.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    const line = page.locator('.sync-line');
    await line.getByText('Estás probando sin cuenta').waitFor();
    await line.getByText('solo en este dispositivo').waitFor();
    assert.equal(await page.locator('.sync-dot--local').count(), 1, 'the bar\'s dot is the empty circle');
    assert.equal(await page.locator('.sync-dot--local .sync-dot__mark').evaluate((mark) => getComputedStyle(mark).backgroundColor), 'rgba(0, 0, 0, 0)', 'and it is drawn empty');
    pass('with no account the bar\'s dot is an empty circle and a line says the songs are only on this device');

    await createSong(page, 'Probando sin cuenta', '[G]Letra de prueba');
    await openSection(page, 'Listados');
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('.sheet-layer.is-open .sheet-action', { hasText: 'Misa' }).first().click();
    await page.locator('section.slot').first().waitFor();
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Probando sin cuenta' }).waitFor();
    await page.locator('.sync-dot').click();
    await page.locator('.toast', { hasText: 'solo en este dispositivo' }).waitFor();
    pass('songs and lists are written to the device, and touching the dot says there is nothing to sync');

    await page.reload();
    await page.getByRole('link', { name: 'Probando sin cuenta' }).waitFor();
    await line.getByText('Estás probando sin cuenta').waitFor();
    assert.deepEqual(sent, [], 'nothing was sent: there is nobody to send it to');
    pass('a reload opens the guest\'s app with their songs, and nothing was ever sent to the server');

    await openSection(page, 'Ajustes');
    await page.getByText('Sin cuenta. Tus cantos, listados y plantillas están solo en este dispositivo.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Salir' }).count(), 0, 'there is nothing to sign out of');
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).first().waitFor();
    await page.getByRole('button', { name: 'Crear cuenta' }).first().waitFor();
    pass('Ajustes says there is no account and offers to sign in instead of "Salir"');

    // ----- signing in: cancelling the question changes nothing -----
    await openSection(page, 'Cantos');
    await signInFromTheApp(page);
    const asking = page.getByRole('alertdialog');
    await asking.getByText('Tienes 1 canto y 1 listado en este dispositivo').waitFor();
    await asking.getByRole('button', { name: 'Cancelar' }).click();
    // Back in the app on the screen it was on (Ajustes, where the sign-in began)
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Probando sin cuenta' }).waitFor();
    await line.getByText('Estás probando sin cuenta').waitFor();
    const me = await page.evaluate(async () => (await fetch('/api/me')).status);
    assert.equal(me, 401, 'the session the sign-in made is not kept');
    pass('signing in asks what to do with what was written; "Cancelar" leaves the person as they were, with no session');

    // ----- "Volver" from the sign-in gives the app back -----
    await openSection(page, 'Ajustes');
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    await page.getByRole('button', { name: 'Volver' }).click();
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Probando sin cuenta' }).waitFor();
    pass('"Volver" from the sign-in gives the guest\'s app back');

    // ----- adding it to the account -----
    await signInFromTheApp(page);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sumarlos a mi cuenta' }).click();
    // What was written is kept, and the person stays on the screen they were on (Ajustes)
    await openSection(page, 'Cantos');
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    await page.getByRole('link', { name: 'De mi cuenta' }).waitFor();
    await page.getByRole('link', { name: 'Probando sin cuenta' }).waitFor();
    await page.waitForFunction(() => document.querySelector('.sync-dot')?.getAttribute('aria-label')?.startsWith('Sincronizado') === true, undefined, { timeout: 15000 });
    assert.equal(await page.locator('.sync-line:not([hidden])').count(), 0, 'the guest line is gone once there is an account');
    assert.deepEqual(await serverSongs(page), ['De mi cuenta', 'Probando sin cuenta']);
    await openSection(page, 'Listados');
    await page.locator('.lrow__title').first().waitFor();
    const templates = await page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as { templates: { name: string }[]; setlists: unknown[] };

        return { templates: answer.templates.map((template) => template.name), lists: answer.setlists.length };
    });
    assert.deepEqual(templates, { templates: ['Misa'], lists: 1 }, 'the list reached the account and the Mass is there once');
    pass('"Sumarlos a mi cuenta": what was written reaches the account next to what it already had, and the guest line is gone');

    // ----- a second device that drops what it wrote -----
    const other = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    await other.goto(server.base + '/');
    await other.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await other.getByRole('heading', { name: 'Cantos' }).waitFor();
    await createSong(other, 'Para descartar', '[D]Nada');
    await signInFromTheApp(other);
    await other.getByRole('alertdialog').getByText('Tienes 1 canto en este dispositivo').waitFor();
    await other.getByRole('alertdialog').getByRole('button', { name: 'Descartarlos' }).click();
    await other.getByRole('link', { name: 'De mi cuenta' }).waitFor();
    await other.getByRole('link', { name: 'Probando sin cuenta' }).waitFor();
    assert.equal(await other.getByRole('link', { name: 'Para descartar' }).count(), 0, 'what was dropped is not there');
    assert.deepEqual(await serverSongs(other), ['De mi cuenta', 'Probando sin cuenta'], 'and never reached the server');
    pass('"Descartarlos": what was written on the device is gone and the account is as it was');

    // ----- nothing written: nothing to ask -----
    const clean = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    await clean.goto(server.base + '/');
    await clean.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await clean.getByRole('heading', { name: 'Cantos' }).waitFor();
    await signInFromTheApp(clean);
    await openSection(clean, 'Cantos');
    await clean.getByRole('link', { name: 'De mi cuenta' }).waitFor();
    assert.equal(await clean.getByRole('alertdialog').count(), 0, 'no question when there was nothing written');
    pass('signing in with nothing written goes straight in, with no question');

    assert.deepEqual(problems, []);
    pass('no uncaught errors');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
