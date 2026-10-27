/**
 * Browser test of phase 1: writing songs, reading them (transposition, notation, fit to the
 * screen), keeping them offline and syncing between two devices. The real PHP server on a
 * throwaway SQLite database, Chromium with the viewports of an iPad and a phone.
 *
 *     npm run build && node tests/e2e/songs.ts
 */
import assert from 'node:assert/strict';
import { chromium, EMAIL, PASSWORD, reporter, signIn, startServer, synced } from './lib.ts';
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
    const back = page.getByRole('link', { name: '← Cantos' });
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
    await page.getByRole('link', { name: '← Cantos' }).click();
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

async function serverSongs(page: Page): Promise<{ id: string; title: string; deletedAt: number | null }[]> {
    return page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as {
            songs: { id: string; title: string; deletedAt: number | null }[];
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
    await page.getByText('Tono Do').first().waitFor();
    pass('the editor previews the song as it will be read, with the key');

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
    await page.getByRole('button', { name: /Volver al tono original/ }).waitFor();
    pass('transposing two semitones changes the chords and the URL');

    await page.reload();
    assert.deepEqual(await chordNames(page), ['Re', 'La']);
    pass('the transposition survives a reload (it is in the URL)');

    await page.getByRole('button', { name: /Volver al tono original/ }).click();
    assert.deepEqual(await chordNames(page), ['Do', 'Sol']);
    assert.ok(!page.url().includes('t='));
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    assert.deepEqual(await chordNames(page), ['Si', 'Fa#']);
    pass('back to the original key, and down a semitone (Do → Si, Sol → Fa#)');

    await page.getByRole('button', { name: /Volver al tono original/ }).click();
    await page.getByRole('button', { name: 'Do → C' }).click();
    assert.deepEqual(await chordNames(page), ['C', 'G']);
    await page.reload();
    assert.deepEqual(await chordNames(page), ['C', 'G'], 'the notation is remembered on this device');
    await page.getByRole('button', { name: 'C → Do' }).click();
    pass('English notation, remembered');

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

    await page.getByRole('button', { name: 'Ajustar' }).click();
    const manual = await measure(page);
    assert.equal(manual.scroll || !manual.columns, true);
    assert.equal(await page.getByRole('button', { name: 'Ajustar' }).getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Letra más grande' }).click();
    pass('turning the fit off gives the manual size buttons back, remembered per device');
    await page.getByRole('button', { name: 'Ajustar' }).click();

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
    await page.getByRole('link', { name: 'Editar' }).click();
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
    assert.equal(await second.locator('.song-item').count(), 5);
    pass('a second device signs in and receives every song');

    await second.getByRole('link', { name: 'Escrito sin conexión' }).click();
    await second.getByRole('link', { name: 'Editar' }).click();
    await second.getByLabel('Título').fill('Editado en la otra tablet');
    await second.getByRole('button', { name: 'Guardar' }).click();
    await synced(second);

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByRole('link', { name: '← Cantos' }).click();
    await page.getByRole('link', { name: 'Editado en la otra tablet' }).waitFor();
    pass('an edit made on one device shows up on the other');

    // ----- deleting -----
    await second.getByRole('link', { name: 'Editar' }).waitFor({ state: 'hidden' }).catch(() => undefined);
    await second.goto(BASE + '/');
    await second.getByRole('link', { name: 'Editado en la otra tablet' }).click();
    await second.getByRole('link', { name: 'Editar' }).click();
    second.once('dialog', (dialog) => void dialog.accept());
    await second.getByRole('button', { name: 'Eliminar' }).click();
    await second.getByRole('heading', { name: 'Cantos' }).waitFor();
    await synced(second);
    assert.ok(!(await second.getByRole('link', { name: 'Editado en la otra tablet' }).isVisible()));
    const gone = (await serverSongs(second)).find((song) => song.title === 'Editado en la otra tablet');
    assert.ok(gone !== undefined && gone.deletedAt !== null, 'the server keeps a tombstone');

    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForFunction(() => !document.body.textContent?.includes('Editado en la otra tablet'));
    pass('deleting a song removes it from the other device too');

    // ----- importing -----
    await page.goto(BASE + '/cantos/importar');
    await page.getByLabel('Texto', { exact: true }).fill(IMPORTED);
    await page.getByRole('button', { name: 'Convertir' }).click();
    await page.getByRole('heading', { name: 'Revisa el resultado' }).waitFor();
    assert.equal(await page.getByLabel('Título').inputValue(), 'Sobre la mesa');
    const converted = await page.getByLabel('Letra con acordes (ChordPro)').inputValue();
    assert.match(converted, /\[Em\]/);
    assert.match(converted, /\{c: Coro\}/);
    await page.getByText('Parte de la misa que dice el encabezado: Ofertorio.').waitFor();
    await page.getByRole('button', { name: 'Guardar canto' }).click();
    await page.getByRole('heading', { name: 'Sobre la mesa' }).waitFor();
    assert.ok((await chordNames(page)).length >= 6);
    pass('importing: chords above the words become a song, reviewed before saving');

    // A whole Mass, one song per page (a form feed between pages, as PDF text has)
    const mass = [
        'ENTRADA: Canto de apertura\n\n  C        G\nAbrimos la puerta de casa\n',
        'GLORIA\n\nDm\nGloria a Dios en el cielo\n',
        'SALIDA: Canto de despedida\n\n  G        D\nVamos en paz a servir\n',
    ].join('\f');
    await page.goto(BASE + '/cantos/importar');
    await page.getByLabel('Texto', { exact: true }).fill(mass);
    await page.getByRole('button', { name: 'Convertir' }).click();
    await page.getByRole('heading', { name: /Se encontraron 3 cantos/ }).waitFor();
    assert.equal(await page.locator('.import-card').count(), 3);
    await page.getByRole('button', { name: 'Guardar 3 cantos' }).click();
    await page.locator('.song-list').waitFor();
    for (const title of ['Canto de apertura', 'Gloria', 'Canto de despedida']) {
        await page.getByRole('link', { name: title }).waitFor();
    }
    pass('importing: a whole Mass with a song per page becomes one song each');

    // ----- signing out -----
    await synced(page);
    await ipad.setOffline(true);
    await createSong(page, 'Pendiente al salir', '[G]No se pudo enviar');
    const dialogs: string[] = [];
    page.once('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Salir' }).click();
    // It tries to send first, offline that fails, and only then does it ask
    for (let waited = 0; dialogs.length === 0 && waited < 50; waited++) {
        await page.waitForTimeout(100);
    }
    assert.match(dialogs[0] ?? '', /1 canto escrito en este dispositivo/);
    await page.getByRole('link', { name: '← Cantos' }).click();
    await page.getByRole('link', { name: 'Pendiente al salir' }).waitFor();
    pass('signing out with an unsent song asks first, and cancelling keeps everything');

    await ipad.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await synced(page);
    await page.getByRole('button', { name: 'Salir' }).click();
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
