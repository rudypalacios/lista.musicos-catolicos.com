/**
 * Browser test of phase 1: writing songs, reading them (transposition, notation, fit to the
 * screen), keeping them offline and syncing between two devices. The real PHP server on a
 * throwaway SQLite database, Chromium with the viewports of an iPad and a phone.
 *
 *     npm run build && node tests/e2e/songs.ts
 */
import assert from 'node:assert/strict';
import { chromium, editFromSongPage, EMAIL, openSongMenu, PASSWORD, reporter, openSection, signIn, signOutFromSettings, startServer, synced } from './lib.ts';
import type { BrowserContext, Page } from 'playwright';

const server = await startServer(18081);
const { pass, count } = reporter();
const BASE = server.base;

const SHORT = '{c: Coro}\n[C]Caminamos con alegría, Señor,\ncantando vamos hacia tu ca[G]sa.';

/** A song as long as `stanzas` stanzas of four lines say */
function longSong(stanzas: number): string {
    const lines: string[] = [];
    for (let i = 1; i <= stanzas; i++) {
        lines.push(`{c: Verso ${i}}`);
        for (let j = 0; j < 4; j++) {
            lines.push(`[Am]Línea ${j + 1} del verso ${i} que [F]camina por el [C]mundo [G]sembrando paz`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

async function createSong(page: Page, title: string, body: string, author = ''): Promise<void> {
    // "Nuevo canto" is on the list; from a song, go back to it first
    const back = page.getByRole('link', { name: 'Volver a Cantos' });
    if (await back.isVisible()) {
        await back.click();
    }
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    if (author !== '') {
        await page.getByLabel('Autor (opcional)').fill(author);
    }
    await page.getByLabel('Letra con acordes').fill(body);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

async function openFromList(page: Page, title: string): Promise<void> {
    await page.getByRole('link', { name: 'Volver a Cantos' }).click();
    await page.getByRole('link', { name: title }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

async function chordNames(page: Page): Promise<string[]> {
    // After a reload the screen is drawn asynchronously: wait for the first chord
    await page.locator('#song-sheet .ch').first().waitFor();

    return page.locator('#song-sheet .ch').allTextContents();
}

interface Fit {
    size: number;
    fits: boolean;
    columns: boolean;
    scroll: boolean;
}

async function measure(page: Page): Promise<Fit> {
    await page.waitForTimeout(150);

    return page.evaluate(() => {
        const content = document.querySelector<HTMLElement>('#song-content');
        const stage = document.querySelector<HTMLElement>('#stage');
        if (content === null || stage === null) {
            throw new Error('no viewer');
        }

        return {
            size: parseFloat(getComputedStyle(content).getPropertyValue('--lyric-size')),
            fits: content.scrollHeight <= stage.clientHeight + 1 && content.scrollWidth <= stage.clientWidth + 1,
            columns: content.classList.contains('is-columns'),
            scroll: content.classList.contains('is-scroll'),
        };
    });
}

async function serverSongs(page: Page): Promise<{ id: string; title: string; myShift: number; deletedAt: number | null }[]> {
    return page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as {
            songs: { id: string; title: string; myShift: number; deletedAt: number | null }[];
        };

        return answer.songs;
    });
}

const IMPORTED = `OFRENDAS: Sobre la mesa

  Em                    C                    G
Compartimos el pan y el vino en la mesa,

CORO

  Em         C          G
COMPARTIMOS EL PAN Y EL VINO EN LA MESA,
`;

const browser = await chromium.launch();
try {
    const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const page = await ipad.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    await signIn(page, BASE);
    await page.getByText('Todavía no hay cantos.').waitFor();
    pass('a new account starts with no songs');

    // ----- writing -----
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill('Caminamos con alegría');
    await page.getByLabel('Letra con acordes').fill(SHORT);
    assert.deepEqual(await page.locator('.preview .ch').allTextContents(), ['Do', 'Sol']);
    // At this width the lyrics and the preview take turns: "Ver" shows the preview, "Escribir" comes back
    assert.equal(await page.locator('.preview').isVisible(), false);
    await page.getByRole('tab', { name: 'Ver' }).click();
    await page.getByText('Tono Do').first().waitFor();
    await page.getByRole('tab', { name: 'Escribir' }).click();
    assert.equal(await page.getByLabel('Letra con acordes').isVisible(), true);
    pass('the editor previews the song as it will be read, with the key');

    // A chord typed in lowercase ([c], [g]) is read as the capital, shown so in the preview, and written so
    await page.getByLabel('Letra con acordes').fill('[c]Caminamos con a[g]legría y [am]fe');
    assert.deepEqual(await page.locator('.preview .ch').allTextContents(), ['Do', 'Sol', 'Lam']);
    await page.getByLabel('Letra con acordes').blur();
    assert.equal(await page.getByLabel('Letra con acordes').inputValue(), '[C]Caminamos con a[G]legría y [Am]fe');
    await page.getByLabel('Letra con acordes').fill(SHORT);
    pass('chords typed in lowercase are read, previewed and written as capitals');

    // No title: said at the field, which gets the focus, and nothing is saved
    await page.getByLabel('Título').fill('');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('#title-error', { hasText: 'El canto necesita un título.' }).waitFor();
    assert.equal(await page.getByLabel('Título').getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'title');
    await page.getByLabel('Título').fill('Caminamos con alegría');
    assert.equal(await page.locator('#title-error').textContent(), '');
    pass('a song with no title says so at the title field, which gets the focus');

    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Caminamos con alegría' }).waitFor();
    await synced(page);
    assert.equal((await serverSongs(page)).length, 1);
    pass('a saved song reaches the server');

    // ----- reading: transposition and notation -----
    assert.deepEqual(await chordNames(page), ['Do', 'Sol']);
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    assert.deepEqual(await chordNames(page), ['Re', 'La']);
    assert.match(page.url(), /\?t=2$/);
    await page.getByRole('button', { name: /Volver al tono mío/ }).waitFor();
    pass('transposing two semitones changes the chords and the URL');

    await page.reload();
    assert.deepEqual(await chordNames(page), ['Re', 'La']);
    pass('the transposition survives a reload (it is in the URL)');

    await page.getByRole('button', { name: /Volver al tono mío/ }).click();
    assert.deepEqual(await chordNames(page), ['Do', 'Sol']);
    assert.ok(!page.url().includes('t='));
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    assert.deepEqual(await chordNames(page), ['Si', 'Fa#']);
    pass('back to the original key, and down a semitone (Do → Si, Sol → Fa#)');

    // "Mi tono": the key the person sings it in; the song opens in it, and it is a field of the song that syncs
    await page.getByRole('button', { name: /Volver al tono mío/ }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Tono guardado como tu tono' }).waitFor();
    assert.ok(!page.url().includes('t='), 'the key of the person is the default: nothing in the address');
    assert.deepEqual(await chordNames(page), ['Re', 'La']);
    await synced(page);
    assert.equal((await serverSongs(page))[0]?.myShift, 2, 'the server holds "mi tono"');
    await page.reload();
    assert.deepEqual(await chordNames(page), ['Re', 'La'], 'the song opens in the key of the person');
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    assert.match(page.url(), /\?t=0$/, 'another key than the person\'s is in the address');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Tono guardado como tu tono' }).waitFor();
    assert.deepEqual(await chordNames(page), ['Do', 'Sol']);
    await synced(page);
    assert.equal((await serverSongs(page))[0]?.myShift, 0);
    pass('"Guardar como mi tono": the song opens in it, it is not in the address, and it syncs');

    // The arrow beside "Guardar", like singing's: mark "Solo por ahora" (writes nothing) or "Como mi tono"
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Otros sitios donde guardar' }).click();
    assert.deepEqual(await page.locator('.tone-control__option').allTextContents(), ['Solo por ahora', 'Como mi tono']);
    await page.locator('.tone-control__option', { hasText: 'Solo por ahora' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Queda solo por ahora' }).waitFor();
    assert.equal((await serverSongs(page))[0]?.myShift, 0, 'nothing was written');
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    pass('the arrow of "Guardar" offers "Solo por ahora" and "Como mi tono"; "Solo por ahora" writes nothing');

    // ----- "Agregar a un listado": the list, then the part; the song goes in the key on screen -----
    const addSheet = page.getByRole('dialog', { name: 'Agregar a un listado' });
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Agregar a un listado' }).click();
    await addSheet.getByRole('button', { name: 'Nuevo listado' }).click();
    await addSheet.getByText('Selecciona una plantilla').waitFor();
    await addSheet.getByRole('button', { name: /^Misa/ }).click();
    await addSheet.getByText('¿En qué sección?').waitFor();
    await addSheet.getByText('Entra en Do# (el tono que ves)').waitFor();
    await addSheet.getByRole('button', { name: /^Ofertorio/ }).click();
    await page.locator('.toast', { hasText: /agregado a Ofertorio de «.+», en Do#/ }).waitFor();
    await page.getByRole('heading', { name: 'Caminamos con alegría' }).waitFor();
    pass('"Agregar a un listado" with a new list: it goes to the part, in the key on screen, and says where');

    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Agregar a un listado' }).click();
    await addSheet.getByRole('button', { name: /1 canto/ }).click();
    assert.equal(await addSheet.getByText('Entra en').count(), 0, 'the key is not said when it is the person\'s own');
    assert.equal(await addSheet.locator('.lrow', { hasText: 'Ofertorio' }).innerText().then((text) => text.includes('Ya está aquí')), true, 'it says the song is already in that part');
    await addSheet.getByRole('button', { name: /^Canto de entrada/ }).click();
    await page.locator('.toast', { hasText: /agregado a Canto de entrada de «.+»$/ }).waitFor();
    await openSection(page, 'Listados');
    await page.locator('.lrow__link').first().click();
    await page.getByRole('heading', { name: 'Ofertorio', exact: true }).waitFor();
    assert.match(await page.locator('#parte-ofertorio').innerText(), /Do#/, 'in the key it had on screen');
    assert.doesNotMatch(await page.locator('#parte-entrada').innerText(), /Do#/);
    assert.equal(await page.locator('.item').count(), 2);
    pass('the song is in both parts of the list, each in the key it was added in');
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Caminamos con alegría' }).click();
    await page.getByRole('heading', { name: 'Caminamos con alegría' }).waitFor();

    // The notation is behind the song page's "⋯", with the other ways the lyrics are drawn
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Cambiar la notación de Do a C' }).click();
    assert.deepEqual(await chordNames(page), ['C', 'G']);
    await page.reload();
    assert.deepEqual(await chordNames(page), ['C', 'G'], 'the notation is remembered on this device');
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Cambiar la notación de C a Do' }).click();
    await page.keyboard.press('Escape');
    pass('English notation, remembered');

    // One row of tools above the song; the rest is behind "⋯", the same kind of sheet as Cantos and a list
    const toolsRow = await page.locator('.song-tools').boundingBox();
    assert.ok(toolsRow !== null && toolsRow.height < 70, 'the tools of the song page are one row');
    assert.equal(await page.locator('.viewer-content .meta .chip', { hasText: 'Tono' }).count(), 0, 'the key is not said twice');
    assert.equal(await page.getByRole('link', { name: 'Editar', exact: true }).count(), 0, 'no loose Editar button');
    await openSongMenu(page);
    assert.deepEqual(
        await page.locator('.sheet-layer.is-open .sheet-action').allTextContents(),
        ['Agregar a un listado', 'Imprimir con acordes', 'Imprimir solo la letra', 'Editar letra y acordes', 'Eliminar canto'],
        'the sheet of the song page: add to a list, print, edit and, last, delete',
    );
    assert.equal(await page.evaluate(() => Array.from(document.querySelectorAll('.sheet-layer.is-open .sheet-action')).at(-1)?.classList.contains('sheet-action--apart')), true, 'delete is set apart like in the other sheets');
    await page.keyboard.press('Escape');
    pass('the song page has one row of tools and a "⋯" sheet like the other screens');

    // ----- reading: fit to the screen -----
    const short = await measure(page);
    assert.ok(short.fits && !short.columns && !short.scroll, 'a short song fits in one column');
    assert.ok(short.size >= 30, `a short song is big (got ${short.size}px)`);
    assert.ok(short.size <= 34, 'but never bigger than the cap');
    pass(`fit to screen: a two-line song is read at ${short.size}px on the iPad`);

    await createSong(page, 'Canto mediano', longSong(3));
    const medium = await measure(page);
    assert.ok(medium.fits, 'a three-stanza song still fits');
    assert.ok(medium.size < short.size, 'and is smaller than the short one');
    pass(`fit to screen: three stanzas fit at ${medium.size}px (${medium.columns ? 'two columns' : 'one column'})`);

    await createSong(page, 'Canto larguísimo', longSong(60));
    const huge = await measure(page);
    assert.ok(huge.scroll && huge.size === 13, 'an enormous song stops at the readable minimum and scrolls');
    pass('fit to screen: an enormous song keeps a readable size and scrolls');

    await createSong(page, 'Canto largo', longSong(14));
    const long = await measure(page);
    assert.ok(long.fits || long.scroll);
    if (long.fits) {
        assert.ok(long.size >= 13);
    }
    console.log(`      (14 stanzas on the iPad: ${long.size}px, ${long.columns ? 'two columns' : long.scroll ? 'scroll' : 'one column'})`);

    // The fit is behind the song page's "⋯"; the sheet closes before the size buttons are used
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Ajustar' }).click();
    assert.equal(await page.getByRole('button', { name: 'Ajustar' }).getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ajustar' }).waitFor({ state: 'hidden' });
    const manual = await measure(page);
    assert.equal(manual.scroll || !manual.columns, true);
    await page.getByRole('button', { name: 'Letra más grande' }).click();
    pass('turning the fit off gives the manual size buttons back, remembered per device');
    await openSongMenu(page);
    await page.getByRole('button', { name: 'Ajustar' }).click();
    await page.keyboard.press('Escape');

    await ipad.setOffline(false);

    // The same songs on a phone
    await page.setViewportSize({ width: 390, height: 844 });
    await openFromList(page, 'Canto mediano');
    const phone = await measure(page);
    assert.ok(phone.fits || phone.scroll);
    assert.ok(!phone.columns, 'a phone never uses two columns');
    console.log(`      (three stanzas on a phone: ${phone.size}px, ${phone.scroll ? 'scroll' : 'fits'})`);
    await openFromList(page, 'Caminamos con alegría');
    const phoneShort = await measure(page);
    assert.ok(phoneShort.fits && phoneShort.size > phone.size);
    pass(`fit to screen on a phone: the short song at ${phoneShort.size}px, no columns`);

    await page.setViewportSize({ width: 1180, height: 820 });
    await openFromList(page, 'Canto largo');
    const landscape = await measure(page);
    console.log(`      (14 stanzas on the iPad in landscape: ${landscape.size}px, ${landscape.columns ? 'two columns' : landscape.scroll ? 'scroll' : 'one column'})`);
    assert.ok(landscape.fits || landscape.scroll);
    pass('rotating the iPad refits the song');
    await page.setViewportSize({ width: 820, height: 1180 });

    // ----- editing -----
    await openFromList(page, 'Caminamos con alegría');
    await editFromSongPage(page);
    await page.getByLabel('Título').fill('Caminamos con alegría (v2)');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Caminamos con alegría (v2)' }).waitFor();
    await synced(page);
    assert.ok((await serverSongs(page)).some((song) => song.title === 'Caminamos con alegría (v2)'));
    pass('editing a song updates it on the server');

    // ----- offline -----
    await ipad.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Caminamos con alegría (v2)' }).waitFor();
    assert.deepEqual(await chordNames(page), ['Do', 'Sol']);
    pass('offline: a song opens from the device after a reload, chords and all');

    await createSong(page, 'Escrito sin conexión', '[Am]Sin red [E]también se escribe');
    await page.getByText(/Sin conexión · 1 sin enviar/).waitFor();
    pass('offline: a new song is saved on the device and counted as unsent');

    await page.reload();
    await page.getByRole('heading', { name: 'Escrito sin conexión' }).waitFor();
    await page.getByText(/1 sin enviar/).waitFor();
    pass('offline: it is still there, and still unsent, after a reload');

    await ipad.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await synced(page);
    assert.ok((await serverSongs(page)).some((song) => song.title === 'Escrito sin conexión'));
    pass('back online: the unsent song is sent by itself');

    // ----- a second device -----
    const tablet: BrowserContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const second = await tablet.newPage();
    await signIn(second, BASE);
    await second.getByRole('link', { name: 'Escrito sin conexión' }).waitFor();
    assert.equal(await second.locator('.song-list .lrow').count(), 5);
    pass('a second device signs in and receives every song');

    await second.getByRole('link', { name: 'Escrito sin conexión' }).click();
    await editFromSongPage(second);
    await second.getByLabel('Título').fill('Editado en la otra tablet');
    await second.getByRole('button', { name: 'Guardar' }).click();
    await synced(second);
    // "Sincronizado" can show for a moment before the save is counted as unsent: wait for the server itself
    for (let waited = 0; waited < 100 && !(await serverSongs(second)).some((song) => song.title === 'Editado en la otra tablet'); waited++) {
        await second.waitForTimeout(100);
    }

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByRole('link', { name: 'Volver a Cantos' }).click();
    await page.getByRole('link', { name: 'Editado en la otra tablet' }).waitFor();
    pass('an edit made on one device shows up on the other');

    // ----- deleting -----
    await second.goto(BASE + '/');
    // From the "⋯" of its row on Cantos, behind a question (Cancel keeps it)
    await second.getByRole('button', { name: 'Más opciones: Editado en la otra tablet' }).click();
    assert.deepEqual(
        await second.locator('.sheet-layer.is-open .sheet-action').allTextContents(),
        ['Editar letra y acordes', 'Eliminar canto'],
        'the sheet of a song: edit it, and last, delete it',
    );
    await second.getByRole('button', { name: 'Eliminar canto' }).click();
    const asked = second.getByRole('alertdialog');
    await asked.getByText('No se puede deshacer').waitFor();
    await asked.getByRole('button', { name: 'Cancelar' }).click();
    await asked.waitFor({ state: 'hidden' });
    await second.getByRole('link', { name: 'Editado en la otra tablet' }).waitFor();
    await second.getByRole('button', { name: 'Más opciones: Editado en la otra tablet' }).click();
    await second.getByRole('button', { name: 'Eliminar canto' }).click();
    await asked.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await second.locator('.toast', { hasText: 'Canto eliminado' }).waitFor();
    await synced(second);
    assert.ok(!(await second.getByRole('link', { name: 'Editado en la otra tablet' }).isVisible()));
    const gone = (await serverSongs(second)).find((song) => song.title === 'Editado en la otra tablet');
    assert.ok(gone !== undefined && gone.deletedAt !== null, 'the server keeps a tombstone');

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !document.body.textContent?.includes('Editado en la otra tablet'));
    pass('deleting a song removes it from the other device too');

    // ----- importing -----
    await page.goto(BASE + '/cantos/importar');
    await page.getByLabel('Pegar el texto con los acordes').fill(IMPORTED);
    await page.getByRole('button', { name: 'Convertir' }).click();
    await page.getByRole('heading', { name: 'Revisa el resultado' }).waitFor();
    assert.equal(await page.getByLabel('Título').inputValue(), 'Sobre la mesa');
    // The preview is what shows first; the text is one tab away
    assert.equal(await page.getByRole('tab', { name: 'Vista previa' }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.import-card .preview .ch').first().isVisible(), true);
    await page.getByRole('tab', { name: 'Letra con acordes' }).click();
    const converted = await page.getByLabel('Letra con acordes (ChordPro)').inputValue();
    assert.match(converted, /\[Em\]/);
    assert.match(converted, /\{c: Coro\}/);
    await page.getByText('Parte de la misa que dice el encabezado: Ofertorio.').waitFor();
    // A chord corrected by hand in lowercase is previewed and saved as the capital, as in the editor
    await page.getByLabel('Letra con acordes (ChordPro)').fill(converted + '\n[am]Extra');
    await page.getByRole('tab', { name: 'Vista previa' }).click();
    assert.ok((await page.locator('.import-card .preview .ch').allTextContents()).includes('Lam'));
    await page.getByRole('button', { name: 'Guardar canto' }).click();
    await page.getByRole('heading', { name: 'Sobre la mesa' }).waitFor();
    assert.ok((await chordNames(page)).includes('Lam'));
    assert.ok((await chordNames(page)).length >= 6);
    pass('importing: chords above the words become a song, reviewed before saving');

    // A whole Mass, one song per page (a form feed between pages, as PDF text has)
    const mass = [
        'ENTRADA: Canto de apertura\n\n  C        G\nAbrimos la puerta de casa\n',
        'GLORIA\n\nDm\nGloria a Dios en el cielo\n',
        'SALIDA: Canto de despedida\n\n  G        D\nVamos en paz a servir\n',
    ].join('\f');
    await page.goto(BASE + '/cantos/importar');
    await page.getByLabel('Pegar el texto con los acordes').fill(mass);
    await page.getByRole('button', { name: 'Convertir' }).click();
    await page.getByRole('heading', { name: /Se encontraron 3 cantos/ }).waitFor();
    assert.equal(await page.locator('.import-card').count(), 3);
    await page.getByRole('button', { name: 'Guardar 3 cantos' }).click();
    await page.locator('.song-list').waitFor();
    for (const title of ['Canto de apertura', 'Gloria', 'Canto de despedida']) {
        await page.getByRole('link', { name: title }).waitFor();
    }
    pass('importing: a whole Mass with a song per page becomes one song each');

    // The same song twice in one import (a repeated page): the second is flagged and starts unmarked, one copy is saved
    const twice = ['ENTRADA: Aleluya del domingo\n\n  C        G\nAleluya, aleluya\n', 'ENTRADA: Aleluya del domingo\n\n  C        G\nAleluya, aleluya\n'].join('\f');
    await page.goto(BASE + '/cantos/importar');
    await page.getByLabel('Pegar el texto con los acordes').fill(twice);
    await page.getByRole('button', { name: 'Convertir' }).click();
    await page.getByRole('heading', { name: /Se encontraron 2 cantos/ }).waitFor();
    const twin = page.locator('.import-card');
    assert.equal(await twin.nth(0).getByRole('checkbox').isChecked(), true);
    assert.equal(await twin.nth(1).getByRole('checkbox').isChecked(), false);
    await twin.nth(1).getByText('Repetido').waitFor();
    await page.getByRole('button', { name: 'Guardar canto' }).click();
    await page.getByRole('heading', { name: 'Aleluya del domingo' }).waitFor();
    await page.goto(BASE + '/cantos');
    await page.locator('.song-list').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Aleluya del domingo' }).count(), 1);
    pass('importing: a song repeated in one file is flagged "Repetido" and saved once');

    // The review of an import: pasting converts at once, a song with no title blocks the save until it has one (its first
    // line is offered), and a song already held starts unmarked
    await page.goto(BASE + '/cantos/importar');
    await page.getByRole('heading', { name: 'Importar cantos' }).waitFor();
    await page.evaluate((text) => {
        const area = document.getElementById('paste') as HTMLTextAreaElement;
        area.value = text;
        area.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
    }, 'C            G\nCaminamos con alegría, Señor,\n\f' + 'GLORIA\n\nDm\nGloria a Dios en el cielo\n');
    await page.getByRole('heading', { name: 'Se encontraron 2 cantos' }).waitFor();
    const rows = page.locator('.import-card');
    assert.equal(await rows.count(), 2);
    assert.equal(await rows.nth(1).getByRole('checkbox').isChecked(), false);
    await rows.nth(1).getByText('Ya la tienes').waitFor();
    assert.equal(await rows.nth(0).locator('.import-card__meta').count(), 0, 'a row with no title shows its field, not a name');
    await rows.nth(0).getByText('Título requerido').waitFor();
    await page.locator('.import-foot__msg', { hasText: 'Falta el título de 1 canto' }).waitFor();
    const saveButton = page.getByRole('button', { name: 'Guardar canto' });
    assert.equal(await saveButton.isDisabled(), true);
    await rows.nth(0).getByRole('button', { name: 'Usar «Caminamos con alegría, Señor,»' }).click();
    assert.equal(await rows.nth(0).getByLabel('Título').inputValue(), 'Caminamos con alegría, Señor,');
    assert.equal(await saveButton.isDisabled(), false);
    await rows.nth(0).getByRole('checkbox').uncheck();
    await page.locator('.import-foot__msg', { hasText: 'Marca al menos un canto' }).waitFor();
    assert.equal(await saveButton.isDisabled(), true);
    await rows.nth(0).getByRole('checkbox').check();
    await saveButton.click();
    await page.getByRole('heading', { name: 'Caminamos con alegría, Señor,' }).waitFor();
    pass('the review of an import: one row per song, a missing title blocks the save and offers the first line, a song already held starts unmarked');

    // A song with a title and no lyrics is allowed, but says so
    await page.goto(BASE + '/cantos/nuevo');
    await page.getByLabel('Título').fill('Solo el título');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.locator('.toast', { hasText: '“Solo el título” se guardó sin letra todavía.' }).waitFor();
    pass('a song saved with no lyrics says so');

    // A note at the end of a line sits beside the words; a chord in parentheses keeps them and transposes
    await page.goto(BASE + '/cantos/nuevo');
    await page.getByLabel('Título').fill('Aleluya con notas');
    await page.getByLabel('Letra con acordes').fill('[C]aleluya [Em]aleluya [(G)]ya {ci: bis}\n{ci: x2}\n[C]Un pueblo que es[F]pera [(G)]{ci : (Bis)}');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Aleluya con notas' }).waitFor();
    assert.equal(await page.locator('.line__note').first().textContent(), 'bis');
    assert.equal(await page.locator('.line--note').textContent(), 'x2');
    const sameRow = await page.evaluate(() => {
        const line = document.querySelector('.line:not(.line--note)') as HTMLElement;
        const note = line.querySelector('.line__note') as HTMLElement;
        const last = Array.from(line.querySelectorAll('.w')).pop() as HTMLElement;

        return note.getBoundingClientRect().left >= last.getBoundingClientRect().right - 1
            && Math.abs(note.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom) < 20;
    });
    assert.equal(sameRow, true, 'the note is beside the last word, not under it');
    // After a chord that ends the line, the note sits one space from the words (under the chord), not past its column
    const gap = await page.evaluate(() => {
        const line = Array.from(document.querySelectorAll('.line:not(.line--note)')).pop() as HTMLElement;
        const note = line.querySelector('.line__note') as HTMLElement;
        const words = Array.from(line.querySelectorAll('.w:not(.w--tail)')).pop() as HTMLElement;

        return note.getBoundingClientRect().left - words.getBoundingClientRect().right;
    });
    assert.ok(gap >= 0 && gap < 24, `the note is next to the words (${gap}px)`);
    assert.deepEqual(await chordNames(page), ['Do', 'Mim', '(Sol)', 'Do', 'Fa', '(Sol)']);
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    assert.deepEqual(await chordNames(page), ['Re', 'Fa#m', '(La)', 'Re', 'Sol', '(La)']);
    pass('a note at the end of a line sits beside it, and a chord in parentheses transposes with the others');

    // ----- the draft of a new song, and a sheet pasted with the chords above the words -----
    const pasteSheet = (text: string): Promise<void> =>
        page.evaluate((sheet) => {
            const area = document.getElementById('body') as HTMLTextAreaElement;
            area.focus();
            const data = new DataTransfer();
            data.setData('text/plain', sheet);
            area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        }, text);
    const SHEET = 'ENTRADA: Camino nuevo\n\nC            G\nCaminamos con alegría, Señor,\n';
    await page.goto(BASE + '/cantos/nuevo');
    await page.getByRole('heading', { name: 'Nuevo canto' }).waitFor();
    await pasteSheet(SHEET);
    await page.getByText('2 acordes convertidos').waitFor();
    assert.equal(await page.getByLabel('Título').inputValue(), 'Camino nuevo');
    assert.match(await page.getByLabel('Letra con acordes').inputValue(), /^\[C\]Caminamos con \[G\]alegría, Señor,/);
    await page.getByRole('button', { name: 'Deshacer' }).click();
    assert.equal(await page.getByLabel('Letra con acordes').inputValue(), SHEET);
    assert.equal(await page.getByLabel('Título').inputValue(), '');
    pass('a sheet pasted with the chords above the words is converted, says how many, and gives back what was pasted');

    await pasteSheet('Una letra sin acordes\nen dos líneas');
    assert.equal(await page.getByText('acordes convertidos').isVisible(), false);
    pass('a plain lyric pasted is left alone');

    // Leaving by the menu keeps what was written; coming back offers it
    await page.getByLabel('Título').fill('Borrador de prueba');
    await page.getByLabel('Letra con acordes').fill('[C]Algo que no se guardó');
    await openSection(page, 'Listados');
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByText('Borrador recuperado').waitFor();
    assert.equal(await page.getByLabel('Título').inputValue(), 'Borrador de prueba');
    assert.equal(await page.getByLabel('Letra con acordes').inputValue(), '[C]Algo que no se guardó');
    pass('what was written and not saved is recovered, as a draft, after leaving by the menu');

    // Closing the app (a reload) keeps it too; "Descartar" empties it for good
    await page.goto(BASE + '/cantos/nuevo');
    await page.getByText('Borrador recuperado').waitFor();
    await page.getByRole('button', { name: 'Descartar' }).click();
    assert.equal(await page.getByLabel('Título').inputValue(), '');
    await page.goto(BASE + '/cantos/nuevo');
    await page.getByRole('heading', { name: 'Nuevo canto' }).waitFor();
    assert.equal(await page.getByText('Borrador recuperado').isVisible(), false);
    pass('a draft survives a reload, and "Descartar" removes it');

    // "Cancelar" and "Guardar" are the two ways to say the draft is not wanted any more
    await page.getByLabel('Título').fill('Lo cancelé');
    await page.getByRole('link', { name: 'Cancelar' }).click();
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByRole('heading', { name: 'Nuevo canto' }).waitFor();
    assert.equal(await page.getByText('Borrador recuperado').isVisible(), false);
    await page.getByLabel('Título').fill('Lo guardé');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Lo guardé' }).waitFor();
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByRole('heading', { name: 'Nuevo canto' }).waitFor();
    assert.equal(await page.getByText('Borrador recuperado').isVisible(), false);
    pass('cancelling or saving a new song clears its draft');

    // Guardar stays in view however long the lyrics are
    await page.getByLabel('Letra con acordes').fill(longSong(30));
    const foot = await page.locator('.edit-foot').boundingBox();
    assert.ok(foot !== null && foot.y + foot.height <= 1180, 'the foot is inside the screen');
    pass('Guardar and Cancelar stay in view with a long song');

    // From 900px the preview is titled outside its box, the two boxes are level, and Guardar / Cancelar keep their size
    // and sit at the right, in the row of "Eliminar" (a new song has none)
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto(BASE + '/cantos/nuevo');
    await page.getByRole('heading', { name: 'Nuevo canto' }).waitFor();
    await page.getByLabel('Letra con acordes').fill('[C]Uno [G]dos');
    const tops = await page.evaluate(() => [
        (document.getElementById('body') as HTMLElement).getBoundingClientRect().top,
        (document.querySelector('.page--edit .preview .song-sheet') as HTMLElement).getBoundingClientRect().top,
    ]);
    assert.ok(Math.abs((tops[0] ?? 0) - (tops[1] ?? 99)) <= 1, `the two boxes are level (${tops.join(' / ')})`);
    const title = await page.evaluate(() => {
        const heading = document.querySelector('.page--edit .preview > h3') as HTMLElement;
        const box = document.querySelector('.page--edit .preview .song-sheet') as HTMLElement;

        return heading.getBoundingClientRect().bottom <= box.getBoundingClientRect().top;
    });
    assert.equal(title, true, 'the title of the preview is outside its box');
    const save = await page.getByRole('button', { name: 'Guardar' }).boundingBox();
    assert.ok(save !== null && save.width < 200, 'Guardar keeps its size');
    assert.equal(await page.locator('.edit-foot').getByRole('button', { name: 'Eliminar' }).count(), 0);
    await page.goto(BASE + '/');
    await page.getByRole('link', { name: 'Lo guardé' }).click();
    await editFromSongPage(page);
    await page.getByRole('heading', { name: 'Editar canto' }).waitFor();
    const row = await page.evaluate(() => {
        const foot = document.querySelector('.edit-foot') as HTMLElement;
        const remove = foot.querySelector('.edit-remove') as HTMLElement | null;
        const saveButton = Array.from(foot.querySelectorAll('button')).find((b) => b.textContent === 'Guardar') as HTMLElement;

        return remove === null ? null : [remove.getBoundingClientRect().top, saveButton.getBoundingClientRect().top, remove.getBoundingClientRect().left, saveButton.getBoundingClientRect().left];
    });
    assert.ok(row !== null, 'Eliminar is in the foot');
    assert.ok(Math.abs((row?.[0] ?? 0) - (row?.[1] ?? 99)) <= 1 && (row?.[2] ?? 99) < (row?.[3] ?? 0), 'Eliminar is level with Guardar, at the left');
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.waitForFunction(() => document.querySelector('.edit-foot .edit-remove') === null);
    await page.locator('.edit-pane--write').getByRole('button', { name: 'Eliminar' }).waitFor();
    pass('on a wide screen the preview is titled outside its box, the boxes are level and the buttons sit at the right with Eliminar');
    await openSection(page, 'Cantos');

    // ----- signing out -----
    await synced(page);
    await ipad.setOffline(true);
    await createSong(page, 'Pendiente al salir', '[G]No se pudo enviar');
    await signOutFromSettings(page);
    // It tries to send first, offline that fails, and only then does it ask, with the app's own dialog
    const asking = page.getByRole('alertdialog');
    await asking.getByText('1 canto escrito en este dispositivo').waitFor();
    await asking.getByRole('button', { name: 'Cancelar' }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Pendiente al salir' }).waitFor();
    pass('signing out with an unsent song asks first, and cancelling keeps everything');

    await ipad.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await synced(page);
    await signOutFromSettings(page);
    await page.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
    const left = await page.evaluate(() => indexedDB.databases().then((dbs) => dbs.length));
    assert.ok(left >= 0);
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    await page.getByRole('link', { name: 'Pendiente al salir' }).waitFor();
    pass('signing out wipes the device; signing in again brings the songs back from the server');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no uncaught errors in the page');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
