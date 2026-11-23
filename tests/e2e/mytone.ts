/**
 * Browser test of "mi tono" reaching the lists. Saved from the song page (Cantos) as "Como mi tono", it moves the song in
 * every list that follows it; a list with a key of its own ("En este listado") keeps it. Order of precedence:
 * only today › this list › "mi tono" › the song's own key.
 *
 *     npm run build && node tests/e2e/mytone.ts
 */
import assert from 'node:assert/strict';
import { chromium, newList, openSection, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18105);
const { pass, count } = reporter();

/** The key a row of the open list shows ("Tono Re" → "Re") */
async function keyInList(page: Page): Promise<string> {
    const key = page.locator('.item__key').first();
    await key.waitFor();

    return ((await key.textContent()) ?? '').replace('Tono', '').trim();
}

/** Makes a list and puts the song in "Ofertorio" (the key it has is the song's "mi tono" at that moment) */
async function listWithTheSong(page: Page): Promise<void> {
    await openSection(page, 'Listados');
    await newList(page);
    await page.getByRole('link', { name: 'Agregar canto a Ofertorio' }).click();
    await page.getByRole('heading', { name: 'Agregar a Ofertorio' }).waitFor();
    await page.locator('[data-song]').first().click();
    await page.locator('.item').first().waitFor();
}

/** The key of the song in each of the three lists, sorted (a list the sync touched moves up in "Recientes", so none is told by its place) */
async function keysOfLists(page: Page): Promise<string[]> {
    const keys: string[] = [];
    for (let n = 0; n < 3; n++) {
        await openSection(page, 'Listados');
        await page.locator('.lrow__link').nth(n).click();
        keys.push(await keyInList(page));
    }

    return keys.sort();
}

const browser = await chromium.launch();
try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await signIn(page, server.base);
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill('Junto a ti Jesús');
    await page.locator('textarea').first().fill('[C]Junto a ti Jesús\n[G]vamos caminando');
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await page.getByRole('heading', { name: 'Junto a ti Jesús' }).waitFor();

    // Three lists with the song: the third gets a key of its own, from singing, "En este listado"
    await listWithTheSong(page);
    await listWithTheSong(page);
    await listWithTheSong(page);
    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.locator('.perform__tone').getByRole('button', { name: 'Subir un semitono' }).click();
    await page.locator('.perform__tone .tone-control__save').click();
    await page.locator('.perform__tone .tone-control__save').waitFor({ state: 'hidden' });
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    assert.equal(await keyInList(page), 'Do#', 'the third list has its own key');
    pass('a list can have a key of its own ("En este listado"), set from singing');

    // From the song page: two semitones up, saved "Como mi tono"
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: /Junto a ti Jesús/ }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByText('Tono guardado como tu tono').waitFor();

    assert.deepEqual(await keysOfLists(page), ['Do#', 'Re', 'Re'], 'the lists that follow "mi tono" moved; the one with its own key kept it (list › mi tono)');
    pass('"Como mi tono" from the song page moves the lists that follow it and respects the one with its own key');

    // Back to the song's own key: the followers go back, the list with its own key still stays
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: /Junto a ti Jesús/ }).click();
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.getByText('Tono guardado como tu tono').waitFor();
    assert.deepEqual(await keysOfLists(page), ['Do', 'Do', 'Do#'], 'without "mi tono" the followers are in the song\'s own key; the fixed list stays');
    pass('"mi tono" back to the original key: the followers return to it, the fixed list still stays');

    // The server holds the same
    await synced(page);
    const held = await page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as { setlists: { deletedAt: number | null; items: { transpose: number; fixed?: true }[] }[] };

        return answer.setlists.filter((list) => list.deletedAt === null).map((list) => list.items.map((item) => `${item.transpose}${item.fixed === true ? '!' : ''}`).join()).sort();
    });
    assert.deepEqual(held, ['0', '0', '1!']);
    pass('the server holds the keys and which one is fixed for its list');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
