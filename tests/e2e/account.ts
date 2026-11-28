/**
 * Browser test of the account area: the card at the top of Ajustes, the copy of the songs (a real .zip, opened by a real unzipper),
 * "Cerrar sesión" with its question, and deleting the account: the link by email, the page of the link that asks first, the 3 days in
 * which signing in offers to keep it (and the locked account answers nothing else), and the rail's foot. The server sends its emails
 * over real SMTP to a little server of the test.
 *
 *     npm run build && node tests/e2e/account.ts
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright';
import { EMAIL, PASSWORD, chromium, confirmSignOut, openSection, reporter, signIn, startMailSink, startServer, synced } from './lib.ts';

const { pass, count } = reporter();
const mail = await startMailSink(18412);
const server = await startServer(18410, { mailPort: 18412 });
const browser = await chromium.launch();

async function phone(width = 390, height = 844): Promise<Page> {
    const page = await (await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', acceptDownloads: true })).newPage();

    return page;
}

/** The status the server answers to a call made by the page itself, with the session the page holds */
const status = (page: Page, path: string): Promise<number> =>
    page.evaluate(async (url) => (await fetch(url)).status, path);

/** Whether the middle of the element is the middle of the screen (the states drawn centred in the mockup) */
async function isCentred(page: Page, selector: string, width: number): Promise<boolean> {
    const box = await page.locator(selector).first().boundingBox();

    return box !== null && Math.abs(box.x + box.width / 2 - width / 2) <= 2;
}

const meOf = (page: Page): Promise<{ email: string; deleteAfter: number | null; google: boolean }> =>
    page.evaluate(async () => (await (await fetch('/api/me')).json()) as { email: string; deleteAfter: number | null; google: boolean });

try {
    // ----- the card at the top of Ajustes -----
    const page = await phone();
    await signIn(page, server.base);
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill('Canto para llevar');
    await page.getByLabel('Letra con acordes').fill('[G]Cantad al [D]Señor');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Canto para llevar' }).waitFor();
    await synced(page);
    await openSection(page, 'Ajustes');
    const card = page.locator('.settings__account');
    await card.getByText(EMAIL).waitFor();
    await card.getByText('Entras con correo y contraseña').waitFor();
    await card.getByText('Correo confirmado').waitFor();
    assert.equal(await card.locator('.acct__avatar').textContent(), 'O', 'the letter of the address');
    const cardBox = (await card.boundingBox())!;
    const lead = (await page.getByText('Se guardan en este dispositivo').boundingBox())!;
    assert.ok(cardBox.y < lead.y, 'the account is above the settings of the device, not at the end');
    await page.getByRole('button', { name: 'Eliminar mi cuenta…' }).scrollIntoViewIfNeeded();
    const zone = (await page.locator('.settings__danger').boundingBox())!;
    assert.ok(zone.y > lead.y + 300, 'and the way to delete is at the end, apart');
    pass('Ajustes opens with the account as a card (letter, address, how it signs in, confirmed) and the way to delete at the end');

    // ----- the copy of the songs -----
    await page.evaluate(() => window.scrollTo(0, 0));
    const download = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Descargar mis cantos' }).click();
    const file = await download;
    assert.match(file.suggestedFilename(), /^mis-cantos-\d{4}-\d{2}-\d{2}\.zip$/);
    const saved = join(mkdtempSync(join(tmpdir(), 'lista-zip-')), file.suggestedFilename());
    await file.saveAs(saved);
    const unzipped = spawnSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip()); [print(n) for n in z.namelist()]; print(z.read("cantos/Canto para llevar.txt").decode())', saved], { encoding: 'utf8' });
    assert.equal(unzipped.status, 0, unzipped.stderr);
    assert.ok(unzipped.stdout.startsWith('None\n'), 'a real unzipper finds nothing wrong with it');
    assert.ok(unzipped.stdout.includes('cantos/Canto para llevar.txt'), unzipped.stdout);
    assert.ok(unzipped.stdout.includes('{title: Canto para llevar}\n\n[G]Cantad al [D]Señor'), 'the song, as ChordPro, with its chords');
    await page.locator('.toast', { hasText: 'Listo: 1 canto' }).waitFor();
    pass('"Descargar mis cantos" gives a .zip a real unzipper opens, with the song in ChordPro');

    // ----- "Cerrar sesión" asks first, and cancelling keeps everything -----
    await card.getByRole('button', { name: 'Cerrar sesión' }).click();
    const asking = page.getByRole('alertdialog', { name: '¿Cerrar sesión?' });
    await asking.getByText('Se quitan de este dispositivo').waitFor();
    await asking.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal((await meOf(page)).email, EMAIL, 'the session is still there');
    pass('"Cerrar sesión" says what it does to this device before it does it, and "Cancelar" leaves everything');

    // ----- deleting: what goes, and the way out of it -----
    await page.getByRole('button', { name: 'Eliminar mi cuenta…' }).click();
    await page.getByRole('heading', { name: '¿Eliminar tu cuenta?' }).waitFor();
    await page.getByText('1 canto', { exact: true }).waitFor();
    await page.getByText('Los enlaces que compartiste').waitFor();
    const leave = page.locator('.delete-account__leave');
    assert.equal((await leave.textContent())?.trim(), 'Si no quieres eliminar tu cuenta, sino solo salir de la aplicación, presiona Cerrar sesión.');
    assert.equal(await leave.getByRole('button', { name: 'Cerrar sesión' }).count(), 1, '"Cerrar sesión" is the link');
    assert.equal(await leave.evaluate((element) => getComputedStyle(element).textAlign), 'center', 'the sentence is centred, as drawn');
    const cancel = page.locator('.delete-account').getByRole('link', { name: 'Cancelar' });
    assert.ok(await isCentred(page, '.delete-account a.button--text', 390), '"Cancelar" is in the middle');
    assert.equal(await cancel.evaluate((element) => getComputedStyle(element).borderTopColor), 'rgba(0, 0, 0, 0)', 'and it is a text, with no box around it');
    const downloadBox = (await page.locator('.delete-account .button--accent-outline').boundingBox())!;
    assert.ok(downloadBox.width > 300, 'the copy is a full-width button with the accent outline');
    await leave.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('alertdialog', { name: '¿Cerrar sesión?' }).getByRole('button', { name: 'Cancelar' }).click();
    pass('the page says what is deleted, and leaving the app is one link away, in a sentence');

    // ----- step 1: the link by email. Nothing is deleted yet -----
    await page.getByRole('button', { name: 'Mandar enlace de confirmación' }).click();
    await page.getByRole('heading', { name: 'Revisa tu correo' }).waitFor();
    await page.getByText(`Te mandamos un enlace a ${EMAIL}`).waitFor();
    for (const part of ['.delete-account__badge', '.delete-account h2', '.delete-account p']) {
        assert.ok(await isCentred(page, part, 390), `${part} is in the middle of "Revisa tu correo", as drawn`);
    }
    const link = await (async () => {
        for (let i = 0; i < 50 && mail.linkTo(EMAIL, '/eliminar/') === null; i++) {
            await page.waitForTimeout(100);
        }

        return mail.linkTo(EMAIL, '/eliminar/');
    })();
    assert.ok(link !== null, 'the email carries the link');
    assert.match(link, new RegExp(`^${server.base}/eliminar/`), "and it points at the site's own address");
    const sent = mail.messages.filter((message) => message.to === EMAIL).at(-1)?.text ?? '';
    assert.match(sent, /3 días/);
    assert.equal((await meOf(page)).deleteAfter, null, 'asking is not deleting');
    await page.reload();
    await page.getByRole('heading', { name: 'Revisa tu correo' }).waitFor({ state: 'detached' }).catch(() => undefined);
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Canto para llevar' }).waitFor();
    pass('asking sends the link to the account\'s address and changes nothing: the songs and the session are there');

    // ----- step 2: the page of the link, in another browser, asks before it does anything -----
    const other = await phone();
    await other.goto(link);
    await other.getByRole('heading', { name: '¿Eliminar tu cuenta?' }).waitFor();
    await other.getByText(`Cuenta: ${EMAIL}`).waitFor();
    await other.getByText('1 canto', { exact: true }).waitFor();
    assert.equal((await meOf(page)).deleteAfter, null, 'opening the link did not delete anything');
    await other.getByRole('link', { name: 'No, conservarla' }).click();
    await other.getByRole('button', { name: 'Usar mi correo' }).waitFor();
    assert.equal((await meOf(page)).deleteAfter, null, '"No, conservarla" changes nothing');
    await other.goto(link);
    await other.getByRole('button', { name: 'Sí, eliminar mi cuenta' }).click();
    await other.getByRole('heading', { name: /^Tu cuenta se eliminará el (lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d{1,2} de [a-z]+$/ }).waitFor();
    await other.getByText('entra otra vez en Listas').waitFor();
    await other.goto(link);
    await other.getByRole('heading', { name: 'Este enlace ya no sirve' }).waitFor();
    pass('the page of the link shows what goes and asks; saying yes starts the 3 days and the link works once');

    // ----- the account is locked: the device finds out, and signing in offers to keep it -----
    await page.reload();
    await page.locator('.sync-line').getByText('La sesión terminó').waitFor();
    await page.locator('.sync-line').getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('heading', { name: /^Tu cuenta se eliminará el / }).waitFor();
    for (const part of ['.gate-overlay .delete-account__badge', '.gate-overlay h2', '.gate-overlay p']) {
        assert.ok(await isCentred(page, part, 390), `${part} is in the middle of the screen that offers to keep the account, as drawn`);
    }
    assert.equal(await page.locator('.gate-overlay').getByRole('button').count(), 2, 'it asks one thing, with two answers: nothing else of the app is there');
    assert.equal(await status(page, '/api/sync?since=0'), 403, 'a locked account answers nothing of the app');
    assert.notEqual((await meOf(page)).deleteAfter, null, 'it says when it will be deleted');
    pass('after confirming, every session ended; signing in offers to keep the account and the server answers nothing else');

    // ----- "Seguir con la eliminación" leaves it as it was, signed out -----
    await page.getByRole('button', { name: 'Seguir con la eliminación' }).click();
    await page.getByLabel('Correo').waitFor();
    assert.equal(await status(page, '/api/me'), 401, 'that session ended');
    pass('"Seguir con la eliminación" ends the session and goes on with the deletion');

    // ----- "Conservar mi cuenta" brings everything back -----
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('button', { name: 'Conservar mi cuenta' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    await page.getByRole('link', { name: 'Canto para llevar' }).waitFor();
    assert.equal((await meOf(page)).deleteAfter, null, 'the account is as it was');
    assert.equal(await status(page, '/api/sync?since=0'), 200);
    pass('"Conservar mi cuenta" opens the app with the songs and everything as it was');

    // ----- on a wide screen the foot of the menu is the person, and leads to the account -----
    const wide = await phone(1280, 800);
    await signIn(wide, server.base);
    const foot = wide.locator('.menu__foot--account');
    await foot.waitFor();
    assert.equal((await foot.locator('.menu__avatar').textContent()), 'O');
    assert.equal((await foot.locator('.menu__email').textContent()), EMAIL);
    assert.ok(!(await foot.textContent())?.includes('Sincronizado'), 'it says nothing of the sync: the dot says it');
    assert.equal(await wide.locator('.menu__foot').getByRole('button').count(), 0, 'and it has no button of its own');
    await foot.click();
    await wide.getByText('Entras con correo y contraseña').waitFor();
    await wide.getByRole('button', { name: 'Cerrar sesión' }).click();
    await confirmSignOut(wide);
    await wide.getByRole('button', { name: 'Usar mi correo' }).waitFor();
    pass('the foot of the menu is the letter and the address, leads to Ajustes, and "Cerrar sesión" there signs out to the welcome');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
    mail.stop();
}
