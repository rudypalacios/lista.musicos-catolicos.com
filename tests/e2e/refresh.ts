/**
 * Browser test of what a sync brings to a page that is already open: another device changes the author of a song, and this
 * device, with the page of that song open, shows the change as soon as it syncs (the dot), with no need to close the app. Two
 * devices on the real PHP server.
 *
 *     npm run build && node tests/e2e/refresh.ts
 */
import assert from 'node:assert/strict';
import { chromium, editFromSongPage, openSection, reporter, signIn, startServer, synced } from './lib.ts';

const server = await startServer(18198);
const { pass, count } = reporter();
const browser = await chromium.launch();

try {
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' })).newPage();
    const tablet = await (await browser.newContext({ viewport: { width: 820, height: 1100 }, serviceWorkers: 'block' })).newPage();
    const problems: string[] = [];
    for (const page of [phone, tablet]) {
        page.on('pageerror', (error) => problems.push(error.message));
        await signIn(page, server.base);
    }

    await openSection(phone, 'Cantos');
    await phone.getByRole('link', { name: 'Nuevo canto' }).click();
    await phone.getByLabel('Título').fill('Caminamos');
    await phone.getByLabel('Autor (opcional)').fill('Uno');
    await phone.getByLabel('Letra con acordes').fill('[G]Caminamos con a[D]legría');
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('.song-sheet').waitFor();
    await synced(phone);

    // The tablet reads the song and keeps its page open
    await tablet.reload();
    await synced(tablet);
    await openSection(tablet, 'Cantos');
    await tablet.getByRole('link', { name: /Caminamos/ }).first().click();
    await tablet.locator('.song-sheet').waitFor();
    await tablet.getByRole('button', { name: 'Más opciones' }).click();
    assert.match(await tablet.locator('.sheet__sub').first().innerText(), /Uno/);
    await tablet.keyboard.press('Escape');

    // The phone changes the author and the title
    await editFromSongPage(phone);
    await phone.getByLabel('Autor (opcional)').fill('Dos');
    await phone.getByLabel('Título').fill('Caminamos juntos');
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('.song-sheet').waitFor();
    await synced(phone);

    // The tablet syncs (the dot): the page it has open shows it
    await tablet.locator('.sync-dot').click();
    await tablet.getByText('Caminamos juntos').first().waitFor();
    await tablet.getByRole('button', { name: 'Más opciones' }).click();
    assert.match(await tablet.locator('.sheet__sub').first().innerText(), /Dos/, 'the new author');
    await tablet.keyboard.press('Escape');
    pass('a page that is open shows what another device changed as soon as this one syncs');

    // The same while singing a list: the tablet sings it, the phone changes the title, the tablet syncs
    const songId = tablet.url().split('/cantos/')[1]?.split(/[/?]/)[0] ?? '';
    assert.ok(songId !== '');
    const listId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await tablet.evaluate(async ({ songId, listId }) => {
        const answer = await fetch('/api/sync', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ songs: [], setlists: [{
                id: listId, title: 'Misa', eventDate: null, notes: '', updatedAt: Date.now(), deleted: false,
                parts: [{ id: 'entrada', name: 'Entrada' }],
                items: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', part: 'entrada', songId, transpose: 0, note: '' }],
            }] }),
        });
        if (!answer.ok) {
            throw new Error(await answer.text());
        }
    }, { songId, listId });
    await tablet.goto(`${server.base}/`);
    await synced(tablet);
    await tablet.goto(`${server.base}/listados/${listId}/cantar/1`);
    await tablet.locator('.perform').waitFor();
    await tablet.waitForFunction(() => document.querySelector('.perform__song-name')?.textContent === 'Caminamos juntos');
    await phone.goto(`${server.base}/cantos/${songId}`);
    await editFromSongPage(phone);
    await phone.getByLabel('Título').fill('Caminamos de nuevo');
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('.song-sheet').waitFor();
    await synced(phone);
    await tablet.evaluate(() => window.dispatchEvent(new Event('online')));
    await tablet.waitForFunction(() => document.querySelector('.perform__song-name')?.textContent === 'Caminamos de nuevo');
    pass('singing a list shows what another device changed in its song once this one syncs');

    // F5: the page opens from what the device has and, once the sync that starts with it ends, shows what the server has
    await editFromSongPage(phone).catch(async () => {
        await phone.goto(`${server.base}/cantos/${songId}`);
        await editFromSongPage(phone);
    });
    await phone.getByLabel('Autor (opcional)').fill('Tres');
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('.song-sheet').waitFor();
    await synced(phone);
    await tablet.goto(`${server.base}/cantos/${songId}`);
    await tablet.locator('.song-sheet').waitFor();
    await synced(tablet);
    await tablet.getByRole('button', { name: 'Más opciones' }).click();
    await tablet.waitForFunction(() => /Tres/.test(document.querySelector('.sheet__sub')?.textContent ?? ''));
    pass('after F5 the page ends up showing what the server has');

    assert.deepEqual(problems, []);
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    await server.stop();
}
