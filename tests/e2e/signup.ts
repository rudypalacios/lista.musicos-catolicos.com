/**
 * Browser test of creating an account: the sign-up form (with the puzzle solved by the device), the page that says the
 * confirmation link went out, the link that confirms the address, "Olvidé mi contraseña" and the link that chooses a new one,
 * and what to do with what a person wrote before signing up (bring it, start from zero, cancel). The server sends its emails
 * over real SMTP to a little server of the test, so the links are the ones the emails carry.
 *
 *     npm run build && node tests/e2e/signup.ts
 */
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { chromium, openSection, reporter, startMailSink, startServer } from './lib.ts';

const PASSWORD = 'una clave bien larga';
const NEW_PASSWORD = 'otra clave todavia mas larga';

const { pass, count } = reporter();
const mail = await startMailSink(18302);
const closed = await startServer(18301);
const server = await startServer(18300, { signupOpen: true, mailPort: 18302 });
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

/** Fills the sign-up form and sends it */
async function signUp(page: Page, email: string, password = PASSWORD): Promise<void> {
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña').fill(password);
    await page.getByLabel('Leí cómo se usan mis datos').check();
    await page.locator('#view').getByRole('button', { name: 'Crear cuenta' }).click();
}

/** The titles of the songs the server holds for the account signed in on `page` */
const serverSongs = (page: Page): Promise<string[]> =>
    page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as { songs: { title: string }[] };

        return answer.songs.map((song) => song.title).sort();
    });

try {
    // ----- while sign-up is closed, nothing offers it -----
    const shut = await freshPhone(closed.base);
    await shut.getByRole('button', { name: 'Probar sin cuenta' }).waitFor();
    assert.equal(await shut.getByRole('button', { name: 'Crear cuenta' }).count(), 0, 'no "Crear cuenta" on the welcome');
    await shut.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await shut.locator('.sync-line').getByRole('button', { name: 'Iniciar sesión' }).waitFor();
    assert.equal(await shut.locator('.sync-line').getByRole('button', { name: 'Crear cuenta' }).count(), 0, 'nor on the guest line');
    pass('closed: the welcome and the guest line do not offer to create an account');

    // ----- creating an account from the welcome -----
    const page = await freshPhone(server.base);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await page.getByRole('heading', { name: 'Crea tu cuenta' }).waitFor();
    for (const [email, password, consent, problem] of [
        ['no es un correo', PASSWORD, true, 'Escribe un correo válido.'],
        ['ana@example.com', 'corta', true, 'al menos 10 caracteres'],
        ['ana@example.com', PASSWORD, false, 'cómo se usan tus datos'],
    ] as const) {
        await page.getByLabel('Correo').fill(email);
        await page.getByLabel('Contraseña').fill(password);
        const box = page.getByLabel('Leí cómo se usan mis datos');
        await (consent ? box.check() : box.uncheck());
        await page.getByRole('button', { name: 'Crear cuenta' }).click();
        await page.getByRole('alert').getByText(problem).waitFor();
    }
    assert.equal(mail.messages.length, 0, 'nothing was sent for a form that was wrong');
    pass('the form says what is wrong before asking anything of the server');

    await page.getByLabel('Correo').fill('ana@example.com');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByLabel('Leí cómo se usan mis datos').check();
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await page.getByRole('heading', { name: 'Te mandamos un enlace' }).waitFor();
    await page.getByText('ana@example.com').first().waitFor();
    await page.waitForFunction(() => document.querySelector('.bar__back') !== null);
    assert.equal(mail.messages.length, 1);
    const confirmLink = mail.linkTo('ana@example.com', '/verificar/');
    assert.ok(confirmLink !== null, 'the email carries the link that confirms the address');
    assert.match(confirmLink, new RegExp(`^${server.base}/verificar/`), 'and it points at the site\'s own address');
    pass('creating an account solves the puzzle on the device, signs in and says the confirmation link was sent');

    await page.getByRole('button', { name: 'Volver a mandarlo' }).click();
    await page.locator('.toast', { hasText: 'Te lo mandamos otra vez' }).waitFor();
    assert.equal(mail.messages.length, 2);
    const newest = mail.linkTo('ana@example.com', '/verificar/');
    assert.notEqual(newest, confirmLink, 'a new link, and the old one is cancelled');
    pass('"Volver a mandarlo" sends another link');

    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    await openSection(page, 'Ajustes');
    await page.getByText('Tu correo todavía no está confirmado').waitFor();
    pass('the new account is in the app, and Ajustes says the address is not confirmed yet');

    // ----- the link of the email, opened in another browser -----
    const elsewhere = await freshPhone(confirmLink);
    await elsewhere.getByRole('heading', { name: 'Este enlace ya no sirve' }).waitFor();
    await elsewhere.goto(newest ?? '');
    await elsewhere.getByRole('heading', { name: 'Correo confirmado' }).waitFor();
    await elsewhere.getByRole('link', { name: 'Abrir Listas' }).waitFor();
    await openSection(page, 'Cantos');
    await openSection(page, 'Ajustes');
    await page.locator('#view').getByText('ana@example.com').waitFor();
    assert.equal(await page.getByText('Tu correo todavía no está confirmado').count(), 0, 'once confirmed, Ajustes says nothing');
    pass('the link confirms the address with no session (another browser); the old one does not work; Ajustes stops saying it');

    // ----- forgetting the password -----
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
    await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    await page.getByLabel('Correo').fill('ana@example.com');
    await page.getByRole('button', { name: 'Mandar el enlace' }).click();
    await page.getByRole('heading', { name: 'Revisa tu correo' }).waitFor();
    const resetLink = mail.linkTo('ana@example.com', '/restablecer/');
    assert.ok(resetLink !== null);
    pass('"Olvidé mi contraseña" sends the link to choose a new one');

    const stranger = await freshPhone(resetLink);
    await stranger.getByRole('heading', { name: 'Elige una contraseña nueva' }).waitFor();
    await stranger.getByLabel('Contraseña nueva').fill('corta');
    await stranger.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await stranger.getByRole('alert').getByText('al menos 10 caracteres').waitFor();
    await stranger.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
    await stranger.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await stranger.getByRole('heading', { name: 'Contraseña cambiada' }).waitFor();
    await stranger.goto(resetLink);
    await stranger.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
    await stranger.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await stranger.getByRole('heading', { name: 'Este enlace ya no sirve' }).waitFor();
    pass('the reset link chooses the new password (a short one does not spend it) and works once');

    await page.getByRole('button', { name: 'Volver' }).click();
    await page.getByLabel('Correo').fill('ana@example.com');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('alert').getByText('Correo o contraseña incorrectos').waitFor();
    await page.getByLabel('Contraseña').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    pass('the old password no longer works and the new one signs in');

    // ----- what a person wrote before signing up: bring it -----
    const guest = await freshPhone(server.base);
    await guest.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await guest.getByRole('heading', { name: 'Cantos' }).waitFor();
    await createSong(guest, 'Lo que escribí antes');
    await guest.locator('.sync-line').getByRole('button', { name: 'Crear cuenta' }).click();
    await signUp(guest, 'beto@example.com');
    const asking = guest.getByRole('alertdialog');
    await asking.getByText('Tienes 1 canto en este dispositivo').waitFor();
    await asking.getByRole('button', { name: 'Traerlos a mi cuenta' }).click();
    await guest.getByRole('heading', { name: 'Te mandamos un enlace' }).waitFor();
    await guest.getByRole('button', { name: 'Continuar' }).click();
    await guest.getByRole('link', { name: 'Lo que escribí antes' }).waitFor();
    await guest.waitForFunction(() => document.querySelector('.sync-dot')?.getAttribute('aria-label')?.startsWith('Sincronizado') === true, undefined, { timeout: 15000 });
    assert.deepEqual(await serverSongs(guest), ['Lo que escribí antes']);
    pass('a guest who creates an account brings what they wrote: it stays and reaches the account');

    // ----- start from zero -----
    const fresh = await freshPhone(server.base);
    await fresh.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await fresh.getByRole('heading', { name: 'Cantos' }).waitFor();
    await createSong(fresh, 'Para empezar de cero');
    await fresh.locator('.sync-line').getByRole('button', { name: 'Crear cuenta' }).click();
    await signUp(fresh, 'carla@example.com');
    await fresh.getByRole('alertdialog').getByRole('button', { name: 'Empezar desde cero' }).click();
    await fresh.getByRole('heading', { name: 'Te mandamos un enlace' }).waitFor();
    await fresh.getByRole('button', { name: 'Continuar' }).click();
    await fresh.getByText('Todavía no hay cantos.').waitFor();
    assert.deepEqual(await serverSongs(fresh), []);
    pass('"Empezar desde cero": the device is emptied and the new account starts with nothing');

    // ----- cancel: the account exists, the person stays as they were -----
    const undecided = await freshPhone(server.base);
    await undecided.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await undecided.getByRole('heading', { name: 'Cantos' }).waitFor();
    await createSong(undecided, 'Sigo probando');
    await undecided.locator('.sync-line').getByRole('button', { name: 'Crear cuenta' }).click();
    await signUp(undecided, 'dora@example.com');
    await undecided.getByRole('alertdialog').getByRole('button', { name: 'Cancelar' }).click();
    await undecided.locator('.toast', { hasText: 'Tu cuenta quedó creada' }).waitFor();
    await openSection(undecided, 'Cantos');
    await undecided.getByRole('link', { name: 'Sigo probando' }).waitFor();
    await undecided.locator('.sync-line').getByText('Estás probando sin cuenta').waitFor();
    assert.equal(await undecided.evaluate(async () => (await fetch('/api/me')).status), 401, 'the session that was just opened is ended');
    pass('cancelling the question leaves the person as a guest with their songs, and the account made');

    // ----- an address that has an account -----
    const twice = await freshPhone(server.base);
    await twice.getByRole('button', { name: 'Crear cuenta' }).click();
    await signUp(twice, 'ana@example.com');
    await twice.getByRole('alert').getByText('Ese correo ya tiene una cuenta').waitFor();
    await twice.getByRole('button', { name: 'Crear cuenta' }).waitFor();
    pass('an address that already has an account is told so, and the form stays');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
    closed.stop();
    mail.stop();
}
