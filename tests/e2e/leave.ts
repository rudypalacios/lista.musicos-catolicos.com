/**
 * Browser test of leaving the editor of a song: with the sheet of chords open the back button closes the sheet and stays on
 * the editor; with changes not saved, leaving (back, a link of the bar) asks first with "Seguir editando", "Descartar" and
 * "Guardar"; with nothing changed it leaves with no question.
 *
 *     npm run build && node tests/e2e/leave.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18111);
const { pass, count } = reporter();

const settle = (page: Page): Promise<void> => page.waitForTimeout(450);
const asking = async (page: Page): Promise<boolean> => (await page.locator('.confirm__panel').count()) === 1;

const browser = await chromium.launch();
try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, server.base);

    // A song to edit
    await page.goto(`${server.base}/cantos/nuevo`);
    await page.getByLabel('Título').fill('Aleluya');
    await page.locator('#body').fill('Hola mundo');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('.song-sheet').waitFor();
    const song = page.url();
    /** Reaches the editor the way a link of the app does (a new entry of the same page), so the back button is the app's to handle */
    const openEditor = async (): Promise<void> => {
        await page.goto(song);
        await page.locator('.song-sheet').waitFor();
        await page.evaluate(() => {
            history.pushState(null, '', `${location.pathname}/editar`);
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await page.locator('#body').waitFor();
    };

    // With nothing changed, back leaves with no question
    await openEditor();
    await page.goBack();
    await settle(page);
    assert.equal(await asking(page), false, 'nothing to lose, nothing asked');
    assert.ok(!page.url().endsWith('/editar'), 'and it left');
    pass('with nothing changed the back button leaves with no question');

    // The sheet of chords open: back closes it and the editor stays
    await openEditor();
    await page.getByRole('tab', { name: 'Ver' }).click();
    await page.locator('.seg[data-place]').first().click();
    await settle(page);
    assert.equal(await page.locator('.chord-dock:not([hidden])').count(), 1, 'the sheet is open');
    await page.goBack();
    await settle(page);
    assert.equal(await page.locator('.chord-dock:not([hidden])').count(), 0, 'back closed the sheet');
    assert.ok(page.url().endsWith('/editar'), 'and the person is still in the editor');
    assert.equal(await asking(page), false, 'with nothing to ask: nothing was changed');
    pass('with the sheet of chords open, the back button closes the sheet and stays in the editor');

    // Open and close the sheet by hand, then back: the entry the sheet took is given back, so back leaves the editor at once
    await page.locator('.seg[data-place]').first().click();
    await settle(page);
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await settle(page);
    await page.goBack();
    await settle(page);
    assert.ok(!page.url().endsWith('/editar'), 'one back leaves: the sheet left nothing behind');
    pass('a sheet closed by hand leaves no entry behind in the history');

    // Changed and not saved: back asks, and "Seguir editando" stays with everything
    await openEditor();
    await page.locator('#body').fill('Hola mundo cambiado');
    await page.goBack();
    await settle(page);
    assert.equal(await asking(page), true, 'something to lose: it asks');
    assert.match(await page.locator('.confirm__panel').innerText(), /Cambiaste este canto y no lo has guardado/);
    assert.ok(page.url().endsWith('/editar'), 'the address is put back while it asks');
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    await settle(page);
    assert.equal(await asking(page), false);
    assert.equal(await page.locator('#body').inputValue(), 'Hola mundo cambiado', 'everything is where it was');
    pass('leaving with changes asks, and "Seguir editando" keeps the person and the text');

    // A change made with the chords sheet counts too, and the sheet goes before the question
    await page.getByRole('tab', { name: 'Ver' }).click();
    await page.locator('.seg[data-place]').first().click();
    await settle(page);
    await page.locator('.chord-chip[data-act="root"][data-v="G"]').click();
    await page.goBack();
    await settle(page);
    assert.equal(await page.locator('.chord-dock:not([hidden])').count(), 0, 'the first back closes the sheet');
    assert.equal(await asking(page), false, 'and does not ask yet');
    await page.goBack();
    await settle(page);
    assert.equal(await asking(page), true, 'the second one asks');
    pass('the back button closes the sheet first and only then asks about what is not saved');

    // "Descartar" leaves and the song stays as it was
    await page.getByRole('button', { name: 'Descartar' }).click();
    await settle(page);
    assert.ok(!page.url().endsWith('/editar'), 'it left');
    await page.goto(song);
    assert.equal(await page.locator('.song-sheet').innerText().then((text) => text.includes('cambiado')), false, 'nothing was saved');
    pass('"Descartar" leaves and the song stays as it was');

    // "Guardar" saves and goes where the person was going (a link of the bar)
    await openEditor();
    await page.locator('#body').fill('Hola mundo guardado');
    await page.getByRole('link', { name: 'Cantos' }).first().click();
    await settle(page);
    assert.equal(await asking(page), true, 'a link asks too');
    await page.getByRole('button', { name: 'Guardar' }).last().click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.ok(!page.url().endsWith('/editar'), 'it went where it was going');
    await page.goto(song);
    assert.ok((await page.locator('.song-sheet').innerText()).includes('guardado'), 'and the song was saved');
    pass('"Guardar" saves and goes where the person was going');

    // A song that cannot be saved (no title) stays, with the field asking for the title
    await openEditor();
    await page.getByLabel('Título').fill('');
    await page.locator('#body').fill('Otro cambio');
    await page.goBack();
    await settle(page);
    await page.getByRole('button', { name: 'Guardar' }).last().click();
    await settle(page);
    assert.ok(page.url().endsWith('/editar'), 'it stays');
    assert.equal(await asking(page), false, 'the question is closed');
    assert.match(await page.locator('#title-error').innerText(), /necesita un título/);
    pass('saving from the question with no title stays in the editor and asks for the title');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
