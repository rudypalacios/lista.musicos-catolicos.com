/**
 * Browser test of the state of a song (draft / published) and of the song page's bar on a wide screen.
 *
 * - A draft carries a grey "Borrador" next to its key in Cantos, in the picker of a section and inside a list; a
 *   published song carries nothing, and publishing only takes the tag away (no "Publicado" appears).
 * - The state travels: the server holds it.
 * - From 900px the key and Guardar sit in the bar of the song page, level with and at the left of the "⋯"; on a phone
 *   they are laid out as before (Guardar under the row).
 *
 *     npm run build && node tests/e2e/draft.ts
 */
import assert from 'node:assert/strict';
import { chromium, newList, openSection, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18104);
const { pass, count } = reporter();
const BODY = '[C]Junto a ti Jesús\n[G]vamos caminando';

async function createSong(page: Page, title: string, draft: boolean): Promise<void> {
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Autor (opcional)').fill('Kairoi');
    await page.locator('textarea').first().fill(BODY);
    assert.equal(await page.getByLabel('Borrador').isChecked(), true, 'a new song starts as a draft');
    if (!draft) {
        await page.getByLabel('Borrador').uncheck();
    }
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    // Saved when the song opens: only then back to the list
    await page.getByRole('heading', { name: title }).waitFor();
    await page.getByRole('link', { name: 'Volver a Cantos' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
}

/** The row of a song in the page, by its title */
const rowOf = (page: Page, title: string) => page.locator('.lrow, .item').filter({ hasText: title });

/** A song in the picker, by its title: its text starts with it (the rows also show the first lines of the lyrics, which can repeat another title) */
const pickerRow = (page: Page, title: string) => page.locator('[data-song]').filter({ hasText: new RegExp(`^${title}`) });

const browser = await chromium.launch();
try {
    const wide = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await signIn(wide, server.base);
    await createSong(wide, 'Junto a ti Jesús', true);
    await createSong(wide, 'En torno al pan', false);

    const draftRow = rowOf(wide, 'Junto a ti Jesús');
    const publishedRow = rowOf(wide, 'En torno al pan');
    await publishedRow.waitFor();
    await draftRow.waitFor();
    assert.equal(await draftRow.getByText('Borrador', { exact: true }).count(), 1);
    assert.equal(await publishedRow.getByText('Borrador', { exact: true }).count(), 0);
    assert.equal(await wide.getByText('Publicado').count(), 0, 'there is no "Publicado" tag');
    const pill = draftRow.locator('.pill--draft');
    assert.equal(await pill.evaluate((element) => element.parentElement?.textContent), 'Kairoi · Do · Borrador', 'after author and key, as a pill');
    pass('Cantos: a draft says "Borrador" after its key; a published song says nothing');

    // The picker of a section, and the list
    await openSection(wide, 'Listados');
    await newList(wide);
    await wide.getByRole('link', { name: 'Agregar canto a Ofertorio' }).click();
    await wide.getByRole('heading', { name: 'Agregar a Ofertorio' }).waitFor();
    assert.equal(await pickerRow(wide, 'Junto a ti Jesús').getByText('Borrador', { exact: true }).count(), 1);
    assert.equal(await pickerRow(wide, 'En torno al pan').getByText('Borrador', { exact: true }).count(), 0);
    pass('the picker of a section marks the draft too');

    await pickerRow(wide, 'Junto a ti Jesús').click();
    await wide.locator('.item').filter({ hasText: 'Junto a ti Jesús' }).waitFor();
    assert.equal(await wide.locator('.item').filter({ hasText: 'Junto a ti Jesús' }).locator('.item__sub').textContent(), 'Kairoi · Tono Do · Borrador');
    pass('inside a list, the draft says "Borrador" in the line of its author and key');

    // Singing: the bar and the list of songs carry it too
    await wide.getByRole('link', { name: 'Cantar' }).click();
    await wide.locator('.perform__song').waitFor();
    assert.equal(await wide.locator('.perform__song .pill--draft').innerText(), 'Borrador');
    // On a wide screen the key is in the bar too, left of the position button
    const toneStep = await wide.locator('.perform__tone .tone-control__step').boundingBox();
    const jump = await wide.getByRole('button', { name: /Ir a otro canto/ }).boundingBox();
    assert.ok(toneStep !== null && jump !== null && toneStep.x + toneStep.width <= jump.x, 'the key is in the bar, left of the position button');
    await wide.locator('.perform__tone').getByRole('button', { name: 'Subir un semitono' }).click();
    const barSave = wide.locator('.perform__tone .tone-control__save');
    await barSave.waitFor();
    await wide.locator('.perform__tone .tone-control__more').click();
    assert.equal(await wide.locator('.perform__tone .tone-control__menu').isVisible(), true, 'the menu of Guardar hangs under the bar');
    await wide.locator('.perform__tone .tone-control__more').click();
    await wide.locator('.perform__tone').getByRole('button', { name: 'Bajar un semitono' }).click();
    await wide.getByRole('button', { name: /Ir a otro canto/ }).click();
    await wide.locator('.perform__song-choice').first().waitFor();
    assert.equal(await wide.locator('.perform__song-choice .pill--draft').count(), 1);
    await wide.keyboard.press('Escape');
    await wide.getByRole('link', { name: 'Volver al listado' }).click();
    pass('singing: the bar and the list of songs say "Borrador" beside the name');

    // The state reaches the server
    await synced(wide);
    const onServer = await wide.evaluate(async () => {
        const response = await fetch('/api/sync?since=0', { credentials: 'same-origin' });

        return (await response.json()) as { songs: { title: string; status: string }[] };
    });
    assert.deepEqual(
        onServer.songs.map(({ title, status }) => [title, status]).sort(),
        [['En torno al pan', 'published'], ['Junto a ti Jesús', 'draft']],
    );
    pass('the state is stored by the server');

    // The song page's bar on a wide screen: key, Guardar and the hint level with, and at the left of, the "⋯"
    await openSection(wide, 'Cantos');
    await wide.getByRole('link', { name: /Junto a ti Jesús/ }).click();
    // The bar names the song as singing does (the way back small above, then "Canción • Tono  Borrador"); the head keeps the author
    const bar = wide.locator('.bar__back--song');
    assert.equal((await bar.locator('small').innerText()).toLowerCase(), 'cantos');
    assert.equal(await bar.locator('.bar__song-name').innerText(), 'Junto a ti Jesús');
    assert.equal(await bar.locator('.bar__song-key').textContent(), 'Tono Do');
    assert.equal(await bar.locator('.pill--draft').innerText(), 'Borrador');
    assert.equal(await wide.locator('.song-head .by').innerText(), 'Kairoi');
    assert.equal(await wide.locator('.song-head h2').count(), 0, 'the title is not said twice');
    await wide.getByRole('button', { name: 'Subir un semitono' }).click();
    assert.equal(await bar.locator('.bar__song-key').textContent(), 'Tono Do#', 'the bar follows the key on screen');
    await wide.getByRole('button', { name: 'Bajar un semitono' }).click();
    pass('the page of a song names itself in the bar: name, key and "Borrador"');
    await wide.getByRole('button', { name: 'Subir un semitono' }).click();
    const box = async (page: Page, locator: ReturnType<Page['locator']>) => {
        const found = await locator.boundingBox();
        assert.ok(found !== null);

        return found;
    };
    const more = await box(wide, wide.getByRole('button', { name: 'Más opciones', exact: true }));
    const step = await box(wide, wide.locator('.song-tools .tone-control__step'));
    const save = await box(wide, wide.getByRole('button', { name: 'Guardar', exact: true }));
    const size = await box(wide, wide.locator('.song-tools__row > .toolbar'));
    for (const [name, found] of [['the key', step], ['Guardar', save]] as const) {
        assert.ok(Math.abs(found.y + found.height / 2 - (more.y + more.height / 2)) < 4, `${name} is level with the "⋯"`);
        assert.ok(found.x + found.width <= more.x, `${name} is at the left of the "⋯"`);
    }
    assert.ok(size.x + size.width <= step.x, 'the lyrics size stays at the other end');
    assert.ok(step.x + step.width <= save.x, 'the key, then Guardar');
    pass('wide: the key and Guardar are in the bar, just left of the "⋯"');

    // Publishing only takes the tag away
    await wide.getByRole('button', { name: 'Más opciones', exact: true }).click();
    await wide.getByRole('button', { name: 'Editar letra y acordes' }).click();
    assert.equal(await wide.getByLabel('Borrador').isChecked(), true);
    await wide.getByLabel('Borrador').uncheck();
    await wide.getByRole('button', { name: 'Guardar' }).first().click();
    await wide.getByRole('link', { name: 'Volver a Cantos' }).click();
    assert.equal(await wide.getByText('Borrador', { exact: true }).count(), 0, 'no tag left');
    assert.equal(await wide.getByText('Publicado').count(), 0, 'and no "Publicado" in its place');
    pass('publishing takes the tag off and puts nothing in its place');

    // A phone keeps its layout: Guardar drops under the row of tools
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
    await signIn(phone, server.base);
    await phone.getByRole('link', { name: /Junto a ti Jesús/ }).click();
    await phone.getByRole('button', { name: 'Subir un semitono' }).click();
    const phoneMore = await box(phone, phone.getByRole('button', { name: 'Más opciones', exact: true }));
    const phoneSave = await box(phone, phone.getByRole('button', { name: 'Guardar', exact: true }));
    assert.ok(phoneSave.y > phoneMore.y + phoneMore.height - 1, 'on a phone Guardar is under the row of tools');
    pass('phone: the bar is as it was (Guardar under the row)');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
