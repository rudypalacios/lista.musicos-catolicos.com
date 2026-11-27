/**
 * Browser test of signing in with Google, against the real server and a stand-in for Google (`fake-google.ts`): the button
 * only where the server offers it, a new account, the same person again on another device, an account that already had that
 * address, what a person wrote with no account (bring it, cancel), and what happens when Google says no, does not confirm
 * the address, or the return was not started by this browser.
 *
 *     npm run build && node tests/e2e/google.ts
 */
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { EMAIL, chromium, enforcePolicy, openSection, reporter, startServer } from './lib.ts';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, startFakeGoogle } from './fake-google.ts';

const { pass, count } = reporter();
const google = await startFakeGoogle(18312);
const server = await startServer(18310, {
    google: { authUrl: google.authUrl, tokenUrl: google.tokenUrl, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET },
});
const without = await startServer(18311);
const browser = await chromium.launch();

/** A phone that opens the app for the first time */
async function freshPhone(base: string): Promise<Page> {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    await page.goto(base + '/');

    return page;
}

async function createSong(page: Page, title: string): Promise<void> {
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Letra con acordes').fill('[G]Letra de prueba');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

const continueWithGoogle = (page: Page) => page.getByRole('link', { name: 'Continuar con Google' });

/** The titles of the songs the server holds for the account signed in on `page` */
const serverSongs = (page: Page): Promise<string[]> =>
    page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as { songs: { title: string }[] };

        return answer.songs.map((song) => song.title).sort();
    });

/** The email the session of `page` belongs to, or null when there is none */
const sessionEmail = (page: Page): Promise<string | null> =>
    page.evaluate(async () => {
        const answer = await fetch('/api/me');

        return answer.ok ? ((await answer.json()) as { email: string }).email : null;
    });

try {
    // ----- the button is there only when the server offers Google -----
    const plain = await freshPhone(without.base);
    await plain.getByRole('button', { name: 'Ya tengo cuenta' }).waitFor();
    await plain.waitForTimeout(500);
    assert.equal(await plain.locator('.google-option').count(), 1, 'the option is drawn, out of sight until the server says it offers Google');
    assert.equal(await plain.locator('.google-option').isVisible(), false, 'a server with no Google set up shows no button');
    assert.equal(await continueWithGoogle(plain).count(), 0);
    await plain.goto(`${without.base}/api/google/start`);
    await plain.locator('.toast', { hasText: 'Entrar con Google no está disponible' }).waitFor();
    assert.ok(!plain.url().includes('google='), 'the word is taken out of the address');
    pass('with no Google set up there is no button, and its address sends the person back with a sentence');

    // ----- the button, under the production policy -----
    const policedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const policed = await policedContext.newPage();
    const violations = await enforcePolicy(policedContext, policed);
    await policed.goto(server.base + '/');
    await continueWithGoogle(policed).waitFor();
    await policed.getByText('Al continuar con Google aceptas cómo se usan tus datos').waitFor();
    assert.equal(await policed.getByRole('link', { name: 'Privacidad' }).getAttribute('href'), '/privacidad');
    assert.equal(await continueWithGoogle(policed).getAttribute('href'), '/api/google/start');
    assert.deepEqual(violations, [], 'nothing the policy forbids: the button is a link, and the mark is drawn in the page');
    pass('the welcome offers "Continuar con Google" with the line about the data, and nothing breaks the policy');

    // ----- a new person -----
    google.next = { sub: 'g-ana', email: 'ana@gmail.com' };
    const ana = await freshPhone(server.base);
    await continueWithGoogle(ana).click();
    await ana.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.ok(!ana.url().includes('google='), 'the word is taken out of the address, so a reload does not repeat it');
    assert.equal(await sessionEmail(ana), 'ana@gmail.com');
    assert.equal(google.lastAuth?.get('scope'), 'openid email', 'only what is needed is asked of Google');
    assert.equal(google.lastAuth?.get('prompt'), 'select_account');
    assert.equal(google.lastAuth?.get('code_challenge_method'), 'S256');
    assert.deepEqual(google.refused, [], 'Google would have accepted the exchange: client, secret, redirect and PKCE proof');
    await openSection(ana, 'Ajustes');
    await ana.locator('#view').getByText('ana@gmail.com').waitFor();
    assert.equal(await ana.getByText('Tu correo todavía no está confirmado').count(), 0, 'Google confirmed it: no link to send');
    pass('a person with no account signs in with Google: the account is made, confirmed, and they are in the app');

    await createSong(ana, 'Canto de Ana');
    await ana.waitForFunction(() => document.querySelector('.sync-dot')?.getAttribute('aria-label')?.startsWith('Sincronizado') === true, undefined, { timeout: 15000 });
    await ana.reload();
    await ana.getByRole('heading', { name: 'Canto de Ana' }).waitFor();
    assert.equal(await ana.locator('.toast').count(), 0, 'a reload says nothing more');
    pass('a reload keeps the session and says nothing again');

    // ----- the same person, on another device -----
    const tablet = await freshPhone(server.base);
    await continueWithGoogle(tablet).click();
    await tablet.getByRole('link', { name: 'Canto de Ana' }).waitFor();
    assert.equal(await sessionEmail(tablet), 'ana@gmail.com');
    pass('the same Google account on another device is the same account, with its songs');

    // ----- an account that already had that address (the owner's, with a password) -----
    google.next = { sub: 'g-owner', email: EMAIL };
    const owner = await freshPhone(server.base);
    await continueWithGoogle(owner).click();
    await owner.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.equal(await sessionEmail(owner), EMAIL);
    pass('an account that already had that address is the one that opens, not a second one');

    // ----- what a person wrote with no account: bring it -----
    google.next = { sub: 'g-beto', email: 'beto@gmail.com' };
    const guest = await freshPhone(server.base);
    await guest.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await guest.getByRole('heading', { name: 'Cantos' }).waitFor();
    await createSong(guest, 'Lo que escribí antes');
    await guest.locator('.sync-line').getByRole('button', { name: 'Crear cuenta' }).click();
    await continueWithGoogle(guest).click();
    const asking = guest.getByRole('alertdialog');
    await asking.getByText('Tienes 1 canto en este dispositivo').waitFor();
    await asking.getByRole('button', { name: 'Traerlos a mi cuenta' }).click();
    await guest.getByRole('link', { name: 'Lo que escribí antes' }).waitFor();
    await guest.waitForFunction(() => document.querySelector('.sync-dot')?.getAttribute('aria-label')?.startsWith('Sincronizado') === true, undefined, { timeout: 15000 });
    assert.deepEqual(await serverSongs(guest), ['Lo que escribí antes']);
    pass('a guest who signs up with Google brings what they wrote: it stays and reaches the account');

    // ----- cancelling the question leaves them as they were -----
    google.next = { sub: 'g-carla', email: 'carla@gmail.com' };
    const undecided = await freshPhone(server.base);
    await undecided.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await undecided.getByRole('heading', { name: 'Cantos' }).waitFor();
    await createSong(undecided, 'Sigo probando');
    await undecided.locator('.sync-line').getByRole('button', { name: 'Crear cuenta' }).click();
    await continueWithGoogle(undecided).click();
    await undecided.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
    await undecided.locator('.toast', { hasText: 'Tu cuenta quedó creada' }).waitFor();
    await openSection(undecided, 'Cantos');
    await undecided.getByRole('link', { name: 'Sigo probando' }).waitFor();
    await undecided.locator('.sync-line').getByText('Estás probando sin cuenta').waitFor();
    assert.equal(await sessionEmail(undecided), null, 'the session that was just opened is ended');
    pass('cancelling the question leaves the person as a guest with their songs');

    // ----- Google says no, or does not confirm the address -----
    google.next = 'deny';
    const denied = await freshPhone(server.base);
    await continueWithGoogle(denied).click();
    await denied.locator('.toast', { hasText: 'Cancelaste el ingreso con Google' }).waitFor();
    await denied.getByRole('button', { name: 'Probar sin cuenta' }).waitFor();
    assert.equal(await sessionEmail(denied), null);
    pass('saying no in Google leaves the person at the welcome with one sentence');

    google.next = { sub: 'g-dudoso', email: 'dudoso@gmail.com', verified: false };
    const unverified = await freshPhone(server.base);
    await continueWithGoogle(unverified).click();
    await unverified.locator('.toast', { hasText: 'Google no tiene confirmado el correo' }).waitFor();
    assert.equal(await sessionEmail(unverified), null);
    pass('an address Google has not confirmed signs nobody in');

    // ----- a return this browser did not start -----
    const exchangesBefore = google.exchanged;
    const forged = await freshPhone(server.base);
    await forged.goto(`${server.base}/api/google/callback?code=${'a'.repeat(32)}&state=${'b'.repeat(64)}`);
    await forged.locator('.toast', { hasText: 'No se pudo entrar con Google' }).waitFor();
    assert.equal(await sessionEmail(forged), null);
    assert.equal(google.exchanged, exchangesBefore, 'Google was not even asked about it');
    pass('a return the browser did not start (no cookie, a state nobody issued) signs nobody in');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
    without.stop();
    google.stop();
}
