/**
 * Browser test of phase 2: setlists. Create a list for a Mass, fill the slots of the template
 * from the library, change the key of a song for that list only, move and annotate songs, sing
 * the list (also with no connection), see it on a second device, and delete a song that is in a
 * list. The real PHP server on a throwaway SQLite database, Chromium with an iPad and a phone.
 *
 *     npm run build && node tests/e2e/setlists.ts
 */
import assert from 'node:assert/strict';
import { chromium, openSection, enforcePolicy, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18086);
const { pass, count } = reporter();
const BASE = server.base;

const SONGS: [string, string][] = [
    ['Abrimos la puerta', '[C]Abrimos la [G]puerta de casa'],
    ['Gloria sencilla', '[G]Gloria a [D]Dios en el cielo'],
    ['Pan de vida', '[Am]Pan de [E]vida para el camino'],
];

async function createSong(page: Page, title: string, body: string): Promise<void> {
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Letra con acordes').fill(body);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

/** No icon is a typed character (it would look different on each device): only drawn ones */
async function noTypedIcons(page: Page, where: string): Promise<void> {
    const found = await page.evaluate(() => (document.body.innerText.match(/[←→↑↓▾▸▶▼★☆✎✓✕×↺⋯⋮＋−]/g) ?? []).join(''));
    assert.equal(found, '', `${where}: no icon typed as a character`);
}

/** The slot of a part of the Mass, by its name */
/**
 * Deletes the list that is open the way a person does now: from the "⋯" of its row on the lists screen, answering
 * the question. Ends on the lists screen.
 */
async function deleteOpenList(page: Page): Promise<void> {
    const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    await openSection(page, 'Listados');
    await page.locator(`[data-more="${id}"]`).click();
    await page.getByRole('button', { name: 'Eliminar listado' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Listado eliminado' }).waitFor();
}

function slot(page: Page, part: string) {
    return page.locator('section.slot', { has: page.getByRole('heading', { name: part, exact: true }) });
}

async function addToSlot(page: Page, part: string, song: string): Promise<void> {
    await page.getByRole('link', { name: `Agregar canto a ${part}` }).click();
    await page.getByRole('heading', { name: `Agregar a ${part}` }).waitFor();
    await page.getByLabel('Buscar cantos').fill(song);
    await page.locator('button.song-item', { hasText: song }).click();
    await page.getByRole('link', { name: 'Volver a Listados' }).waitFor();
}

/** What the song on screen shows as chords */
async function chords(page: Page): Promise<string[]> {
    await page.locator('#song-sheet .ch').first().waitFor();

    return page.locator('#song-sheet .ch').allTextContents();
}

async function serverData(page: Page) {
    return page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as {
            songs: { id: string; title: string; body: string; myShift: number; deletedAt: number | null }[];
            setlists: {
                id: string; title: string; eventDate: string | null; notes: string; starred: boolean; deletedAt: number | null;
                items: { id: string; part: string; songId: string; transpose: number; note: string }[];
            }[];
        };

        return answer;
    });
}

type ServerData = Awaited<ReturnType<typeof serverData>>;

/**
 * What the server holds once `ready` says so. An edit is saved on the device at once and sent a
 * moment later, so the header can still say "Sincronizado" right after it: wait for the
 * server itself.
 */
async function serverWhen(page: Page, ready: (data: ServerData) => boolean): Promise<ServerData> {
    for (let attempt = 0; attempt < 100; attempt++) {
        const data = await serverData(page);
        if (ready(data)) {
            return data;
        }
        await page.waitForTimeout(150);
    }
    throw new Error('The server never got the change');
}

/** A one-finger swipe on the song, as a touch screen sends it */
async function swipe(page: Page, from: number, to: number): Promise<void> {
    await page.evaluate(([a, b]) => {
        const stage = document.querySelector('#stage');
        if (stage === null) {
            throw new Error('no stage');
        }
        const touch = (x: number): Touch => new Touch({ identifier: 1, target: stage, clientX: x, clientY: 300 });
        stage.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(a ?? 0)], bubbles: true }));
        stage.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(b ?? 0)], bubbles: true }));
    }, [from, to]);
}

/** Opens the "⋯" sheet over the song (every tool, the account) */
async function openTools(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Más herramientas' }).click();
    await page.locator('.sheet-layer.is-open').waitFor();
}

/** Closes whichever sheet is open */
async function closeSheet(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await page.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
}

/** Jumps to the n-th song of the list with the position button */
async function jumpTo(page: Page, n: number): Promise<void> {
    await page.getByRole('button', { name: /Ir a otro canto/ }).click();
    await page.locator('.perform__song-choice').nth(n - 1).click();
}

const browser = await chromium.launch();
try {
    const ipad = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const page = await ipad.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    await signIn(page, BASE);
    for (const [title, body] of SONGS) {
        await createSong(page, title, body);
    }
    await synced(page);

    // ----- the lists screen and the template -----
    await openSection(page, 'Listados');
    await page.getByRole('heading', { name: 'Listados' }).waitFor();
    await page.getByText('Todavía no hay listados.').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Listados', exact: true }).getAttribute('aria-current'), 'page');
    pass('the Listados tab starts empty and is marked as the section on screen');

    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('section.slot').first().waitFor();
    const today = await page.evaluate(() => {
        const now = new Date();

        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });
    assert.equal(await page.getByLabel('Fecha de la misa').inputValue(), today);
    assert.match(await page.getByLabel('Título').inputValue(), /^Misa del \d{1,2} de [a-záéíóú]+$/);
    pass('"Nuevo listado" opens a list for today with a title made of the day');

    const names = await page.locator('section.slot h3').allTextContents();
    assert.deepEqual(names, [
        'Canto de entrada', 'Señor, ten piedad', 'Gloria', 'Salmo responsorial', 'Aclamación antes del Evangelio',
        'Ofertorio', 'Santo', 'Aclamación memorial', 'Amén', 'Padre nuestro', 'Rito de la paz', 'Cordero de Dios',
        'Canto de comunión', 'Acción de gracias', 'Canto de salida',
    ]);
    assert.equal(await page.locator('section.slot .badge').count(), 5);
    pass('the template has every part of the Missal in order, five of them marked "opcional"');

    // The sign of peace explains itself: a visible ⓘ button, not a hover
    const info = page.getByRole('button', { name: 'Qué es esto: Rito de la paz' });
    assert.match((await info.getAttribute('title')) ?? '', /No es parte de la misa/);
    assert.ok(!(await page.getByText('El Misal no prescribe', { exact: false }).isVisible()));
    await info.click();
    await page.getByText('No es parte de la misa: el Misal no prescribe un canto para el saludo de la paz').waitFor();
    assert.equal(await info.getAttribute('aria-expanded'), 'true');
    await info.click();
    await page.getByText('No es parte de la misa: el Misal no prescribe').waitFor({ state: 'hidden' });
    pass('the sign of peace slot explains itself with a visible ⓘ button (and a title)');

    // The memorial acclamation explains itself too (what it is, when it is sung)
    await page.getByRole('button', { name: 'Qué es esto: Aclamación memorial' }).click();
    await page.getByText('La canta la asamblea justo después de la consagración').waitFor();
    await page.getByRole('button', { name: 'Qué es esto: Aclamación memorial' }).click();
    pass('the memorial acclamation explains what it is with a visible ⓘ button');

    // ----- filling the slots -----
    await addToSlot(page, 'Canto de entrada', 'puerta');
    // Choosing a song returns to the part it was added to, with the new song marked, and says it was saved
    await page.waitForFunction(() => document.querySelector('#parte-entrada .item.is-new') !== null);
    assert.equal(new URL(page.url()).hash, '', 'the address is cleaned once the part is shown');
    await page.locator('.toast', { hasText: 'Guardado' }).waitFor();
    pass('picking a song returns to its part with the new song marked, and a toast says it was saved');

    await addToSlot(page, 'Canto de comunión', 'Pan de vida');
    await addToSlot(page, 'Canto de comunión', 'Gloria');
    assert.deepEqual(await slot(page, 'Canto de comunión').locator('.item__title').allTextContents(), ['Pan de vida', 'Gloria sencilla']);
    await page.getByRole('link', { name: 'Cantar' }).waitFor();
    await page.getByText('3 cantos').waitFor();
    pass('a slot takes several songs, added at the end');

    // The picker searches the lyrics too, shows the lines that matched, and reads a song before adding it
    await page.getByRole('link', { name: 'Agregar canto a Acción de gracias' }).click();
    await page.getByLabel('Buscar cantos').fill('cielo');
    const found = page.locator('button.song-item', { hasText: 'Gloria sencilla' });
    await found.waitFor();
    assert.equal(await page.locator('button.song-item').count(), 1, 'only the song with that word in its lyrics');
    assert.match((await found.locator('.song-item__snippet').textContent()) ?? '', /Gloria a Dios en el cielo/);
    await page.getByRole('button', { name: 'Ver el canto completo: Gloria sencilla' }).click();
    await page.locator('.sheet-layer.is-open .preview__lyrics .ch').first().waitFor();
    assert.deepEqual(await page.locator('.sheet-layer.is-open .preview__lyrics .ch').allTextContents(), ['Sol', 'Re']);
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await page.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
    await page.getByRole('heading', { name: 'Agregar a Acción de gracias' }).waitFor();
    await page.getByLabel('Buscar cantos').fill('');
    const first = await page.locator('button.song-item .song-item__snippet').first().textContent();
    assert.ok((first ?? '') !== '', 'every row shows the start of its lyrics');
    await page.getByLabel('Buscar cantos').fill('cielo');
    await page.getByRole('button', { name: 'Ver el canto completo: Gloria sencilla' }).click();
    await page.getByRole('button', { name: 'Agregar a Acción de gracias' }).click();
    await slot(page, 'Acción de gracias').locator('.item__title', { hasText: 'Gloria sencilla' }).waitFor();
    pass('the picker finds a song by its lyrics, shows the lines that matched, previews it and adds it from the preview');
    await slot(page, 'Acción de gracias').getByRole('button', { name: 'Más opciones: Gloria sencilla' }).click();
    await page.getByRole('button', { name: 'Quitar del listado' }).click();
    await slot(page, 'Acción de gracias').locator('.item').waitFor({ state: 'detached' });

    // A song that is not in the library is written right from the picker, and lands in the part
    await page.getByRole('link', { name: 'Agregar canto a Acción de gracias' }).click();
    await page.getByLabel('Buscar cantos').fill('Santo es el Señor');
    await page.getByText('Ningún canto coincide con la búsqueda.').waitFor();
    await page.getByRole('link', { name: 'Crear «Santo es el Señor»' }).click();
    assert.equal(await page.getByLabel('Título').inputValue(), 'Santo es el Señor');
    await page.getByLabel('Letra con acordes').fill('[D]Santo es el [A]Señor');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await slot(page, 'Acción de gracias').locator('.item__title', { hasText: 'Santo es el Señor' }).waitFor();
    pass('a song missing from the picker is created there with the search as its title, and ends in the part');
    // Out again, so the rest of the test counts the songs it put in itself
    await slot(page, 'Acción de gracias').getByRole('button', { name: 'Más opciones: Santo es el Señor' }).click();
    await page.getByRole('button', { name: 'Quitar del listado' }).click();
    await slot(page, 'Acción de gracias').locator('.item').waitFor({ state: 'detached' });

    // ----- the key, for this list only: read here, changed while singing -----
    const entrada = slot(page, 'Canto de entrada');
    assert.match((await entrada.locator('.item__key').textContent()) ?? '', /Do$/);
    assert.equal(await page.getByRole('button', { name: /semitono/ }).count(), 0, 'the list has no key buttons');
    await noTypedIcons(page, 'a list');
    await entrada.getByRole('button', { name: 'Más opciones: Abrimos la puerta' }).click();
    await page.getByRole('button', { name: /Cantar desde aquí/ }).click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    await noTypedIcons(page, 'singing');
    await openTools(page);
    await noTypedIcons(page, 'the sheet of singing');
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.locator('.tone-control__hint').waitFor();
    await noTypedIcons(page, 'the key control with a change');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Tono guardado en este listado' }).waitFor();
    await page.locator('.tone-control__hint').waitFor({ state: 'hidden' });
    await closeSheet(page);
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await entrada.locator('.item__key.is-changed', { hasText: 'Re' }).waitFor();
    assert.equal(await entrada.locator('.item__today').count(), 0, 'a saved key is not "hoy"');
    pass('the list shows the key to read; it is changed while singing, saved with "Guardar", and shows in amber when it is not the song\'s own (Do → Re)');

    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Abrimos la puerta' }).click();
    assert.deepEqual(await chords(page), ['Do', 'Sol']);
    pass('the song itself keeps its own key');
    await openSection(page, 'Listados');
    await page.locator('.lrow__link').first().click();
    await page.locator('section.slot').first().waitFor();
    await slot(page, 'Canto de entrada').locator('.item__key.is-changed', { hasText: 'Re' }).waitFor();
    pass('and the list remembers the key after leaving the screen');

    // ----- moving and quitting, from the sheet of each song -----
    const comunion = slot(page, 'Canto de comunión');
    await comunion.getByRole('button', { name: 'Más opciones: Gloria sencilla' }).click();
    await page.locator('.sheet-layer.is-open').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bajar en esta parte' }).count(), 0, 'the last song of a part cannot go lower');
    await page.getByRole('button', { name: 'Subir en esta parte' }).click();
    await page.waitForFunction(() => document.querySelector('section.slot[data-part="comunion"] .item__title')?.textContent === 'Gloria sencilla');
    await page.getByRole('button', { name: 'Bajar en esta parte' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Subir en esta parte' }).count(), 0, 'now the first, it cannot go higher');
    assert.equal(await page.locator('.sheet-layer.is-open').count(), 1, 'the sheet stays open to move again');
    await closeSheet(page);
    pass('a song moves up from its sheet, which stays open and offers only the move that is left');

    await slot(page, 'Canto de entrada').getByRole('button', { name: 'Más opciones: Abrimos la puerta' }).click();
    await page.locator('.sheet-layer.is-open').waitFor();
    assert.equal(await page.getByRole('button', { name: /en esta parte/ }).count(), 0, 'a song alone in its part has no move');
    await page.getByRole('button', { name: /Cantar desde aquí/ }).waitFor();
    await closeSheet(page);
    pass('a song alone in its part has no move to offer, only singing from it and removing it');

    // The list screen shows no notes for now (the note of a song is written while singing)
    assert.equal(await page.getByRole('button', { name: /nota/i }).count(), 0);
    assert.equal(await page.locator('[aria-label*="Nota"], .item__note, .item__noteline').count(), 0);

    // A title cannot be emptied: it says so, in Spanish, and the list keeps the old one
    const oldTitle = await page.getByLabel('Título').inputValue();
    await page.getByLabel('Título').fill('   ');
    await page.getByLabel('Título').blur();
    await page.getByText('El listado necesita un título.').waitFor();
    pass('an empty title is refused with a message');
    await page.getByLabel('Título').fill(oldTitle);

    await page.getByLabel('Título').fill('Domingo de prueba');
    await page.getByLabel('Fecha de la misa').fill('2026-11-01');
    await page.getByLabel('Fecha de la misa').blur();
    await page.getByText('dom 1 nov').waitFor();
    const afterHeader = await serverWhen(page, (data) => data.setlists[0]?.eventDate === '2026-11-01');
    const stored = afterHeader.setlists[0];
    assert.equal(stored?.title, 'Domingo de prueba');
    assert.equal(stored?.eventDate, '2026-11-01');
    assert.deepEqual(stored?.items.map((item) => [item.part, item.transpose, item.note]), [
        ['entrada', 2, ''], ['comunion', 0, ''], ['comunion', 0, ''],
    ]);
    pass('title, day, order and keys reach the server (the day is a chip that shows "dom 1 nov")');

    // The same song in two parts: allowed, with a quiet notice on both (and in the picker beforehand)
    await page.getByRole('link', { name: 'Agregar canto a Canto de salida' }).click();
    await page.getByLabel('Buscar cantos').fill('puerta');
    await page.locator('button.song-item', { hasText: 'Abrimos la puerta' }).waitFor();
    assert.equal(await page.getByText('Ya está en').count(), 0, 'searching does not warn');
    await page.locator('button.song-item', { hasText: 'Abrimos la puerta' }).click();
    await page.locator('.toast', { hasText: '“Abrimos la puerta” también está en: Canto de entrada' }).waitFor();
    await slot(page, 'Canto de salida').locator('.item__title').waitFor();
    await slot(page, 'Canto de salida').getByText('También está en: Canto de entrada').waitFor();
    await slot(page, 'Canto de entrada').getByText('También está en: Canto de salida').waitFor();
    assert.equal(await slot(page, 'Canto de comunión').locator('.item__also').count(), 0);
    pass('the same song in two parts is allowed: a notice when it is added (not while searching) and on both rows');
    const quitFromSalida = async (): Promise<void> => {
        await slot(page, 'Canto de salida').getByRole('button', { name: 'Más opciones: Abrimos la puerta' }).click();
        await page.getByRole('button', { name: 'Quitar del listado' }).click();
        await slot(page, 'Canto de salida').locator('.item').waitFor({ state: 'detached' });
    };
    await quitFromSalida();
    await page.locator('.toast--action', { hasText: '«Abrimos la puerta» quitado del listado' }).waitFor();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await slot(page, 'Canto de salida').locator('.item').waitFor();
    await slot(page, 'Canto de salida').getByText('También está en: Canto de entrada').waitFor();
    pass('quitting a song asks nothing and offers "Deshacer", which puts it back in its place');
    await quitFromSalida();
    await slot(page, 'Canto de entrada').locator('.item__also').waitFor({ state: 'detached' });

    // ----- singing the list -----
    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    assert.equal(await page.locator('.perform__count').textContent(), '1/3');
    assert.deepEqual(await chords(page), ['Re', 'La']);
    assert.match(await page.locator('.perform__part').textContent() ?? '', /Canto de entrada/);
    assert.equal(await page.locator('.menu').isVisible(), false);
    assert.equal(await page.locator('header.bar').isVisible(), false, 'the app header gives its room to the song');
    await page.getByRole('button', { name: /Ir a otro canto/ }).click();
    await page.locator('.sheet-layer.is-open').waitFor();
    assert.equal(await page.locator('.perform__song-choice').count(), 3);
    assert.equal(await page.locator('.perform__song-choice[aria-current="true"]').innerText().then((text) => text.includes('Abrimos la puerta')), true);
    await closeSheet(page);
    pass('singing opens the first song in the key of the list, with its part, no tabs and no app header in the way');

    // The Android back button closes a sheet instead of leaving the screen
    const singingUrl = page.url();
    await openTools(page);
    await page.goBack();
    await page.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
    assert.equal(page.url(), singingUrl, 'back with a sheet open stays on the song');
    await openTools(page);
    await closeSheet(page);
    await page.waitForFunction(() => history.state === null);
    await page.getByRole('button', { name: /Ir a otro canto/ }).click();
    await page.locator('.sheet-layer.is-open').waitFor();
    await page.goBack();
    await page.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
    assert.equal(page.url(), singingUrl);
    pass('back closes the sheet that is open and gives back its history entry when it is closed by hand');

    // On a phone a sheet always rises from the bottom edge and the bar stays where it is
    await page.setViewportSize({ width: 412, height: 860 });
    const placement = (): Promise<{ scrolled: number; barTop: number; sheetBottom: number; sheetTop: number; height: number }> =>
        page.evaluate(() => {
            const sheet = (document.querySelector('.sheet-layer.is-open .sheet') as HTMLElement).getBoundingClientRect();

            return {
                scrolled: (document.querySelector('.perform') as HTMLElement).scrollTop,
                barTop: (document.querySelector('.perform__chrome') as HTMLElement).getBoundingClientRect().top,
                sheetBottom: Math.round(sheet.bottom),
                sheetTop: Math.round(sheet.top),
                height: window.innerHeight,
            };
        });
    for (const open of [() => page.getByRole('button', { name: /Ir a otro canto/ }).click(), () => page.getByRole('button', { name: 'Más herramientas' }).click()]) {
        await open();
        await page.locator('.sheet-layer.is-open').waitFor();
        await page.waitForTimeout(400); // the slide finishes
        const where = await placement();
        assert.equal(where.scrolled, 0, 'opening a sheet does not scroll the screen under it');
        assert.equal(where.barTop, 0, 'the bar stays at the top');
        assert.equal(where.sheetBottom, where.height, 'the sheet rises from the bottom edge');
        assert.ok(where.sheetTop > where.height * 0.25, 'and leaves the top of the screen free');
        await closeSheet(page);
    }
    await page.setViewportSize({ width: 820, height: 1180 });
    pass('both sheets rise from the bottom edge on a phone, whatever the song, and leave the bar and the screen alone');

    await jumpTo(page, 2);
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.equal(await page.locator('.perform__count').textContent(), '2/3');
    assert.deepEqual(await chords(page), ['Sol', 'Re']);
    assert.match(await page.locator('.perform__part').textContent() ?? '', /Canto de comunión/);
    pass('the position button lists the songs in the order of the Mass and jumps to the one chosen');

    await page.keyboard.press('ArrowRight');
    await page.getByRole('heading', { name: 'Pan de vida' }).waitFor();
    await openTools(page);
    assert.equal(await page.getByLabel('Nota de este canto').count(), 0, 'singing has no note field');
    assert.equal(await page.locator('.perform__more.has-note').count(), 0);
    await closeSheet(page);
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    pass('the arrow keys move between songs, and the note of the item is written in the sheet, not in the way');

    await swipe(page, 600, 200);
    await page.getByRole('heading', { name: 'Pan de vida' }).waitFor();
    assert.ok(await page.locator('.stage.slide-in-next').count() > 0, 'the next song slides in');
    await swipe(page, 200, 600);
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    await swipe(page, 300, 330); // too short to count
    await swipe(page, 200, 190);
    assert.equal(await page.locator('.perform__count').textContent(), '2/3');
    pass('a swipe moves between songs; a small move does not');

    // The song follows the finger as soon as the swipe starts, and springs back when it is let go short
    const dragged = await page.evaluate(() => {
        const stage = document.querySelector<HTMLElement>('#stage');
        if (stage === null) {
            throw new Error('no stage');
        }
        const touch = (x: number): Touch => new Touch({ identifier: 1, target: stage, clientX: x, clientY: 300 });
        stage.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(400)], bubbles: true }));
        stage.dispatchEvent(new TouchEvent('touchmove', { touches: [touch(380)], bubbles: true }));
        stage.dispatchEvent(new TouchEvent('touchmove', { touches: [touch(340)], bubbles: true }));
        const during = stage.style.transform;
        stage.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(360)], bubbles: true }));

        return during;
    });
    assert.equal(dragged, 'translateX(-60px)', 'the song moves with the finger');
    await page.waitForFunction(() => document.querySelector<HTMLElement>('#stage')?.style.transform === '');
    assert.equal(await page.locator('.perform__count').textContent(), '2/3');
    pass('the song follows the finger while it swipes and springs back when let go short');

    await openTools(page);
    await page.getByRole('button', { name: 'Letra más grande' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('lista:tamano-listado')), '1');
    assert.equal(await page.evaluate(() => localStorage.getItem('lista:tamano-cantos')), null, 'the library keeps its own size');
    await closeSheet(page);
    await page.keyboard.press('ArrowRight');
    await page.getByRole('heading', { name: 'Pan de vida' }).waitFor();
    await openTools(page);
    assert.equal(await page.getByRole('button', { name: 'Letra más grande' }).getAttribute('aria-disabled'), 'false');
    const nextSize = await page.evaluate(() => getComputedStyle(document.querySelector('#song-content') as Element).fontSize);
    await page.getByRole('button', { name: 'Letra más pequeña' }).click();
    const smallerSize = await page.evaluate(() => getComputedStyle(document.querySelector('#song-content') as Element).fontSize);
    assert.notEqual(nextSize, smallerSize, 'the next song opened with the size the last one was left at');
    await closeSheet(page);
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    pass('the lyric size chosen stays for the next song');

    await openTools(page);
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await closeSheet(page);
    await page.waitForFunction(() => document.querySelector('#song-sheet .ch')?.textContent === 'Lab');
    assert.deepEqual(await chords(page), ['Lab', 'Mib']);
    const afterShift = await serverWhen(page, (data) =>
        data.setlists[0]?.items.find((item) => item.part === 'comunion' && item.note === '')?.transpose === 1);
    assert.equal(afterShift.setlists[0]?.items.length, 3);
    assert.equal(afterShift.songs.find((song) => song.title === 'Gloria sencilla')?.body, SONGS[1]?.[1], 'the song on the server is unchanged');
    pass('changing the key while singing is saved to the item of the list, not to the song');

    // A change that is not saved is only for today: it is shown, it survives a reload, and the list keeps its key
    await openTools(page);
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.locator('.perform__strip-key.is-today').waitFor();
    assert.deepEqual(await chords(page), ['Sib', 'Fa']);
    await closeSheet(page);
    await page.reload();
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.deepEqual(await chords(page), ['Sib', 'Fa'], 'the key of today survives a reload');
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await slot(page, 'Canto de comunión').locator('.item__today', { hasText: 'hoy' }).waitFor();
    assert.equal(await serverData(page).then((data) =>
        data.setlists[0]?.items.find((item) => item.part === 'comunion' && item.songId === data.songs.find((s) => s.title === 'Gloria sencilla')?.id)?.transpose), 1,
    'nothing was written to the list');
    await page.getByRole('link', { name: 'Cantar' }).click();
    await jumpTo(page, 2);
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.deepEqual(await chords(page), ['Sib', 'Fa'], 'the key of today is there when the song is opened from the list');
    await openTools(page);
    await page.getByRole('button', { name: /Volver al tono del listado/ }).click();
    await page.locator('.tone-control__hint').waitFor({ state: 'hidden' });
    assert.deepEqual(await chords(page), ['Lab', 'Mib']);
    await closeSheet(page);
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await page.locator('section.slot').first().waitFor();
    assert.equal(await page.locator('.item__today').count(), 0, 'going back to the saved key clears "hoy"');
    pass('a key that is not saved is only for today: amber in the strip, "hoy" in the list, kept through a reload, nothing written, and "Listado" goes back');
    // "Mi tono": saved from the list as well, with the arrow beside "Guardar"; a song added later starts in it
    await page.getByRole('link', { name: 'Cantar' }).click();
    await jumpTo(page, 2);
    await openTools(page);
    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.getByRole('button', { name: 'Otros sitios donde guardar' }).click();
    assert.deepEqual(await page.locator('.tone-control__option').allTextContents(), ['Solo hoy', 'En este listado', 'Como mi tono', 'En el listado y como mi tono']);
    assert.equal(await page.locator('.tone-control__option.is-current').innerText(), 'En este listado', 'it starts marked on the list');
    // "Guardar" does what is marked. "Solo hoy": nothing is written, with the menu open or closed
    await page.getByRole('button', { name: 'Solo hoy', exact: true }).click();
    assert.equal(await page.locator('.tone-control__menu').isVisible(), false, 'marking closes the menu');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Queda solo para hoy' }).waitFor();
    assert.equal(await page.locator('.tone-control__hint').isVisible(), true, 'the key is still only for today');
    assert.equal(await page.locator('.item__today').count() + await page.locator('.toast', { hasText: 'Tono guardado' }).count(), 0, 'nothing was saved');
    await page.getByRole('button', { name: 'Otros sitios donde guardar' }).click();
    assert.equal(await page.locator('.tone-control__option.is-current').innerText(), 'Solo hoy', 'the mark stays on "Solo hoy"');
    await page.getByRole('button', { name: 'En el listado y como mi tono' }).click();
    assert.equal(await page.locator('.tone-control__hint').isVisible(), true, 'marking an option saves nothing yet');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Tono guardado en este listado y como tu tono' }).waitFor();
    await page.locator('.tone-control__hint').waitFor({ state: 'hidden' });
    await page.getByText('Mío', { exact: false }).first().waitFor();
    const both = await serverWhen(page, (data) =>
        data.songs.find((song) => song.title === 'Gloria sencilla')?.myShift === 2
        && (data.setlists[0]?.items.some((item) => item.part === 'comunion' && item.transpose === 2) ?? false));
    assert.equal(both.songs.find((song) => song.title === 'Gloria sencilla')?.body, SONGS[1]?.[1], 'the text of the song is not touched');
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Tono guardado en este listado' }).waitFor();
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await page.getByRole('button', { name: 'Otros sitios donde guardar' }).click();
    await page.getByRole('button', { name: 'Como mi tono', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await serverWhen(page, (data) => data.songs.find((song) => song.title === 'Gloria sencilla')?.myShift === 0);
    await page.getByRole('button', { name: /Volver al tono del listado/ }).click();
    assert.deepEqual(await chords(page), ['Lab', 'Mib']);
    await closeSheet(page);
    pass('"mi tono" is saved from the list too, apart from the key of the list or together with it, and it syncs');

    // Editing the chart from singing: the scope is said, a moved key moves what is sung the other way, and it comes back
    await page.getByRole('button', { name: 'Más herramientas' }).waitFor();
    await openTools(page);
    await page.getByRole('button', { name: /Editar letra y acordes/ }).click();
    await page.getByRole('heading', { name: 'Editar canto' }).waitFor();
    assert.match(page.url(), /\/cantos\/[^/]+\/editar\?volver=/);
    await page.getByText(/Está en/).first().waitFor();
    assert.match(await page.locator('.notice-line').first().innerText(), /Está en 1 listado/);
    assert.equal(await page.locator('.notice-line__details:not([hidden])').count(), 0, 'the why is behind its button');
    await page.getByRole('button', { name: 'Más información' }).first().click();
    await page.locator('.notice-line__details:not([hidden])').waitFor();
    await page.getByLabel('Letra con acordes').fill('[A]Gloria a [E]Dios en el cielo');
    await page.getByText('El tono original pasó de').waitFor();
    assert.match(await page.locator('.notice-line--tone').innerText(), /Sol.*La/);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.match(page.url(), /\/cantar\/2$/, 'it comes back to the song being sung');
    assert.deepEqual(await chords(page), ['Lab', 'Mib'], 'what is sung did not change: the key of the list moved the other way');
    await serverWhen(page, (data) => {
        const gloria = data.songs.find((song) => song.title === 'Gloria sencilla');

        return gloria?.body === '[A]Gloria a [E]Dios en el cielo'
            && data.setlists[0]?.items.find((item) => item.songId === gloria.id)?.transpose === -1;
    });
    pass('editing the chart from singing says where it applies, keeps what is sung (the key of the list moves the other way) and comes back');
    await page.goBack().catch(() => undefined);
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await page.locator('section.slot').first().waitFor();
    await page.getByRole('link', { name: 'Cantar' }).click();
    await jumpTo(page, 2);

    // ----- offline -----
    await ipad.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.deepEqual(await chords(page), ['Lab', 'Mib']);
    await jumpTo(page, 1);
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    assert.deepEqual(await chords(page), ['Re', 'La']);
    pass('offline: a reload of the singing screen still shows the songs, in the keys of the list');

    await openTools(page);
    await page.getByRole('button', { name: 'Bajar un semitono' }).click();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await closeSheet(page);
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await page.locator('section.slot').first().waitFor();
    await slot(page, 'Canto de entrada').locator('.item__key.is-changed', { hasText: 'Do#' }).waitFor();
    await page.getByText(/Sin conexión · 1 sin enviar/).waitFor();
    pass('offline: editing the list works and is counted as unsent');
    await ipad.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await synced(page);

    // ----- a second device -----
    const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const second = await tablet.newPage();
    await signIn(second, BASE);
    await openSection(second, 'Listados');
    await second.getByRole('link', { name: /Domingo de prueba/ }).click();
    await second.locator('section.slot').first().waitFor();
    await slot(second, 'Canto de entrada').locator('.item__key.is-changed', { hasText: 'Do#' }).waitFor();
    assert.equal(await slot(second, 'Canto de comunión').locator('.item').count(), 2);
    pass('a second device receives the list with its keys and songs');

    await second.getByLabel('Título').fill('Domingo, editado en la tablet');
    await second.getByLabel('Título').blur();
    await synced(second);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByRole('link', { name: 'Volver a Listados' }).click();
    await page.getByRole('link', { name: /Domingo, editado en la tablet/ }).waitFor();
    pass('an edit of the list made on one device shows up on the other');

    // ----- stars: the starred lists first, searching, and the star on the other device -----
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('section.slot').first().waitFor();
    await page.getByLabel('Título').fill('Rosario en familia');
    await page.getByLabel('Título').blur();
    await page.getByLabel('Fecha de la misa').fill('');
    await page.getByLabel('Fecha de la misa').blur();
    await page.getByRole('link', { name: 'Volver a Listados' }).click();
    await page.getByRole('button', { name: 'Más opciones: Rosario en familia' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Recientes' }).count(), 0, 'no headings while nothing is starred');
    assert.equal(await page.locator('.lrow__title').first().textContent(), 'Rosario en familia', 'the list edited last comes first');
    assert.equal(await page.locator('.lrow__detail').first().textContent(), '0 cantos', 'a list with no day shows no day');
    pass('with no stars the lists are one flat list, the most recently edited first, with no text explaining the star');
    assert.equal(await page.locator('button.star').count(), 0, 'there is no star on the rows: each has a "⋯"');

    await page.getByRole('button', { name: 'Más opciones: Domingo, editado en la tablet' }).click();
    assert.deepEqual(await page.locator('.sheet-layer.is-open .sheet-action').allTextContents(), ['Destacar', 'Duplicar listadoUna copia sin fecha, con los mismos cantos y tonos', 'Eliminar listado']);
    await page.getByRole('button', { name: 'Destacar', exact: true }).click();
    await page.getByRole('heading', { name: 'Destacados' }).waitFor();
    await page.getByRole('heading', { name: 'Recientes' }).waitFor();
    assert.equal(await page.locator('.lgroup').first().locator('.lrow__title').textContent(), 'Domingo, editado en la tablet');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-more') !== null), true, 'the focus goes back to its "⋯"');
    pass('the "⋯" of a list opens its sheet; starring from it moves the list to "Destacados" and keeps the focus on its "⋯"');

    const starredRow = page.locator('.lrow', { hasText: 'Domingo, editado en la tablet' });
    await starredRow.locator('.lrow__detail svg').waitFor();
    assert.match(await starredRow.locator('.lrow__detail .sr-only').textContent() ?? '', /Destacado/);
    assert.equal(await page.locator('.lrow', { hasText: 'Rosario en familia' }).locator('.lrow__detail svg').count(), 0, 'a list that is not starred has no star');
    const mark = await starredRow.locator('.lrow__detail svg').evaluate((el) => ({ color: getComputedStyle(el).color, height: el.getBoundingClientRect().height }));
    assert.equal(mark.color, 'rgb(240, 180, 41)', 'the star is yellow');
    assert.ok(mark.height > 8 && mark.height < 20, `and small, as tall as the letters (got ${mark.height}px)`);
    pass('a starred list shows a small yellow star beside its details');
    await noTypedIcons(page, 'the lists screen');

    const more = await page.getByRole('button', { name: 'Más opciones: Domingo, editado en la tablet' }).boundingBox();
    assert.ok(more !== null && more.width >= 44 && more.height >= 44, 'the "⋯" is a 44px target');
    pass('the "⋯" of a row is a tap target of at least 44px');

    await page.getByLabel('Buscar listados').fill('ROSARIO');
    assert.equal(await page.locator('.lrow').count(), 1);
    assert.equal(await page.locator('.lgroup__label').count(), 0, 'searching shows one list with no headings');
    await page.getByLabel('Buscar listados').fill('cuaresma');
    await page.getByText('Ningún listado coincide con la búsqueda.').waitFor();
    await page.getByLabel('Buscar listados').fill('');
    await page.getByRole('heading', { name: 'Destacados' }).waitFor();
    pass('the search finds a list by title, ignoring case, and says when nothing matches');

    await synced(page);
    assert.equal((await serverData(page)).setlists.filter((list) => list.starred).length, 1);
    await second.evaluate(() => window.dispatchEvent(new Event('online')));
    await openSection(second, 'Listados');
    await second.getByRole('heading', { name: 'Destacados' }).waitFor({ timeout: 15000 });
    pass('the star reaches the other device');

    // the extra list goes, so the rest of the test finds the screen as it expects
    // (inside a list there is no "Eliminar listado" any more: it is in the row's sheet, behind a question)
    await page.getByLabel('Buscar listados').fill('rosario');
    await page.getByRole('link', { name: /Rosario en familia/ }).click();
    await deleteOpenList(page);
    // A copy of a list: for today, with its songs and keys, in a list of its own that opens at once
    const songsIn = async (): Promise<number> => (await serverData(page)).setlists.find((list) => list.title === 'Domingo, editado en la tablet')?.items.length ?? 0;
    const original = await songsIn();
    assert.ok(original > 0, 'the list to copy has songs');
    await page.getByRole('button', { name: 'Más opciones: Domingo, editado en la tablet' }).click();
    await page.getByRole('button', { name: /Duplicar listado/ }).click();
    await page.locator('section.slot').first().waitFor();
    await page.locator('.toast', { hasText: 'Copiado de «Domingo, editado en la tablet»' }).waitFor();
    assert.equal(await page.getByLabel('Título').inputValue(), 'Copia de Domingo, editado en la tablet');
    // The copy has no day: the chip offers one and there is nothing to remove
    await page.getByText('Fecha', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Quitar la fecha' }).isVisible(), false, 'no day, nothing to remove');
    await page.getByText(new RegExp(`${original} cantos?`)).first().waitFor();
    await serverWhen(page, (data) => data.setlists.filter((list) => list.deletedAt === null && list.items.length === original).length >= 2);
    pass('duplicating a list opens "Copia de …" with no day and the same songs, says where it came from, and leaves the original');
    // A day can be set and taken away again: the list may serve for a month
    await page.getByLabel('Fecha de la misa').fill('2026-11-08');
    await page.getByLabel('Fecha de la misa').blur();
    const clear = page.getByRole('button', { name: 'Quitar la fecha' });
    await clear.waitFor();
    const clearBox = await clear.boundingBox();
    assert.ok(clearBox !== null && clearBox.width >= 44 && clearBox.height >= 44, '"Quitar la fecha" is a 44px target');
    await serverWhen(page, (data) => data.setlists.some((list) => list.title.startsWith('Copia de') && list.eventDate === '2026-11-08'));
    await clear.click();
    await page.getByText('Fecha', { exact: true }).waitFor();
    await clear.waitFor({ state: 'hidden' });
    await serverWhen(page, (data) => data.setlists.some((list) => list.title.startsWith('Copia de') && list.eventDate === null && list.deletedAt === null));
    pass('a day can be set and removed again with the "✕" beside it, and that reaches the server');
    await deleteOpenList(page);

    await page.getByRole('button', { name: 'Más opciones: Domingo, editado en la tablet' }).click();
    await page.getByRole('button', { name: 'Quitar de destacados', exact: true }).click();
    await page.getByRole('heading', { name: 'Destacados' }).waitFor({ state: 'hidden' });
    await synced(page);

    // ----- the way to add a song is in the head of the part -----
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('section.slot').first().waitFor();
    const empty = slot(page, 'Señor, ten piedad');
    assert.equal((await empty.locator('.slot__head a.add').innerText()).trim(), 'Agregar', 'a part with no song has "Agregar", in its head');
    const comunionLong = slot(page, 'Canto de comunión');
    for (let n = 0; n < 3; n++) {
        await addToSlot(page, 'Canto de comunión', 'puerta');
    }
    assert.equal(await comunionLong.locator('.slot__head a.add--icon').count(), 1, 'with songs it is a "+" in the head');
    assert.equal(await comunionLong.locator('.slot__head a.add--icon').innerText(), '', 'with no words');
    assert.equal(await comunionLong.locator('ul.items ~ a.add').count(), 0, 'and nothing under the songs while there are few');
    await addToSlot(page, 'Canto de comunión', 'puerta');
    await comunionLong.getByRole('link', { name: 'Agregar canto al final de Canto de comunión' }).waitFor();
    assert.equal(await comunionLong.locator('.slot__head a.add--icon').count(), 1, 'the one in the head stays');
    const plus = await comunionLong.locator('.slot__head a.add--icon').boundingBox();
    assert.ok(plus !== null && plus.width >= 44 && plus.height >= 44, 'the "+" is a 44px target');
    pass('"Agregar" is always in the head of the part: words while it is empty, a "+" with songs, and from four songs also one at the end');

    await deleteOpenList(page);
    await synced(page);

    // ----- deleting a song that is in a list -----
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Pan de vida' }).click();
    await page.getByRole('link', { name: 'Editar' }).click();
    const dialogs: string[] = [];
    page.once('dialog', (dialog) => {
        dialogs.push(dialog.message());
        void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Eliminar' }).click();
    for (let waited = 0; dialogs.length === 0 && waited < 50; waited++) {
        await page.waitForTimeout(100);
    }
    assert.match(dialogs[0] ?? '', /está en el listado “Domingo, editado en la tablet”/);
    assert.match(dialogs[0] ?? '', /Canto eliminado/);
    pass('deleting a song that is in a list says so, and cancelling keeps it');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    await openSection(page, 'Listados');
    await page.getByRole('link', { name: /Domingo, editado en la tablet/ }).click();
    await slot(page, 'Canto de comunión').getByText('Canto eliminado').waitFor();
    assert.equal(await slot(page, 'Canto de comunión').locator('.item__key').count(), 1, 'a deleted song has no key to show');
    pass('the list shows "Canto eliminado" where the song was');

    await page.getByRole('link', { name: 'Cantar' }).click();
    await jumpTo(page, 3);
    await page.getByRole('heading', { name: 'Canto eliminado' }).waitFor();
    await jumpTo(page, 2);
    pass('singing a list with a deleted song says so and keeps going');

    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await page.getByRole('button', { name: 'Más opciones: Canto eliminado' }).click();
    await page.getByRole('button', { name: 'Quitar del listado' }).click();
    await page.locator('.setlist-head__meta').getByText('2 cantos').waitFor();
    pass('the deleted song can be removed from the list');

    // ----- deleting the list: from the lists screen, behind a question -----
    await page.getByRole('button', { name: 'Más opciones del listado' }).click();
    await page.getByRole('button', { name: 'Imprimir con acordes' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Eliminar listado' }).count(), 0, 'inside a list there is no way to delete it');
    await page.keyboard.press('Escape');
    const openId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    await openSection(page, 'Listados');
    await page.locator(`[data-more="${openId}"]`).click();
    const last = page.getByRole('button', { name: 'Eliminar listado' });
    await last.waitFor();
    assert.equal((await page.locator('.sheet-layer.is-open .sheet-action').allTextContents()).at(-1), 'Eliminar listado', 'it is the last action of the sheet');
    await last.click();
    const question = page.getByRole('alertdialog');
    await question.getByText('No se puede deshacer').waitFor();
    assert.equal(await question.evaluate((node) => node.contains(document.activeElement)), true, 'focus is inside the question');
    await question.getByRole('button', { name: 'Cancelar' }).click();
    await question.waitFor({ state: 'hidden' });
    assert.equal(await page.locator(`[data-more="${openId}"]`).count(), 1, 'cancelling keeps the list');
    await page.locator(`[data-more="${openId}"]`).click();
    await page.getByRole('button', { name: 'Eliminar listado' }).click();
    await page.keyboard.press('Escape');
    await question.waitFor({ state: 'hidden' });
    assert.equal(await page.locator(`[data-more="${openId}"]`).count(), 1, 'Escape also keeps it');
    pass('a list is deleted from its row on the lists screen, after a question that Cancel and Escape answer with "no"');
    await page.locator(`[data-more="${openId}"]`).click();
    await page.getByRole('button', { name: 'Eliminar listado' }).click();
    await question.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.locator('.toast', { hasText: 'Listado eliminado' }).waitFor();
    await page.getByText('Todavía no hay listados.').waitFor();
    await synced(page);
    assert.ok((await serverData(page)).setlists.every((list) => list.deletedAt !== null));
    await second.evaluate(() => window.dispatchEvent(new Event('online')));
    await second.getByText('Todavía no hay listados.').waitFor({ timeout: 15000 }).catch(async () => {
        await openSection(second, 'Listados');
        await second.getByText('Todavía no hay listados.').waitFor();
    });
    pass('deleting a list removes it here and on the other device');

    // ----- a phone -----
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('section.slot').first().waitFor();
    await addToSlot(page, 'Canto de salida', 'puerta');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `no sideways scroll on a phone (got ${overflow}px)`);
    const tooSmall = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('#view button, #view a.button, #view input'))
            .filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height < 40)
            .map((el) => el.textContent || el.getAttribute('aria-label') || el.tagName));
    assert.deepEqual(tooSmall, [], 'every control is at least 40px tall');
    pass('on a phone the list does not scroll sideways and its controls are big enough to tap');

    // The menu is always at the bottom, also inside a list, and the messages rest above it
    const menuBox = (await page.locator('.menu').boundingBox())!;
    assert.ok(menuBox.y + menuBox.height >= 844 - 1, 'the menu rests at the bottom of the window');
    await page.getByRole('button', { name: /Toca para sincronizar/ }).click();
    await page.locator('.toast').waitFor();
    const toastBox = (await page.locator('.toast').boundingBox())!;
    assert.ok(toastBox.y + toastBox.height <= menuBox.y, 'a message does not cover the menu');
    pass('on a phone the menu is at the bottom of every screen and the messages sit above it');

    // Back from a song returns to the same place in the list (the list is long on a phone)
    await page.evaluate(() => {
        const view = document.querySelector('#view');
        if (view !== null) {
            view.scrollTop = 600;
        }
    });
    const before = await page.evaluate(() => document.querySelector('#view')?.scrollTop ?? 0);
    assert.ok(before > 0, 'the list is long enough to scroll');
    // Touching a song sings it from here, and back returns to the same place
    const salidaRow = slot(page, 'Canto de salida').locator('.item').first();
    assert.equal(await page.locator('.slots a.item__open').count(), 0, 'a song of the list is a button, not a link');
    await salidaRow.locator('.item__title').click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    assert.match(page.url(), /\/cantar\/\d+$/);
    await page.goBack();
    await page.locator('section.slot').first().waitFor();
    await page.waitForFunction((top) => (document.querySelector('#view')?.scrollTop ?? 0) >= top - 2, before);
    assert.equal(await page.locator('.sheet-layer.is-open').count(), 0);
    pass('touching a song in the list sings it from there, and back returns to the same place');

    // Back from singing a song returns to the same place in the list
    await slot(page, 'Canto de salida').getByRole('button', { name: 'Más opciones: Abrimos la puerta' }).click();
    await page.getByRole('button', { name: /Cantar desde aquí/ }).click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    await page.goBack();
    await page.locator('section.slot').first().waitFor();
    await page.waitForFunction((top) => (document.querySelector('#view')?.scrollTop ?? 0) >= top - 2, before);
    pass('back from singing a song returns to the same place in the list');

    // A desktop: the parts in two columns, the tools of each song on one line
    await page.setViewportSize({ width: 1280, height: 800 });
    const columns = await page.evaluate(() => getComputedStyle(document.querySelector('.slots') as Element).columnCount);
    assert.equal(columns, '2');
    const rowHeight = await page.locator('#parte-salida .item').first().evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(rowHeight < 80, `a song takes one compact row on a desktop (got ${rowHeight}px)`);
    pass('on a desktop the parts go in two columns and each song takes one compact row');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no uncaught errors in the page');

    // ----- under the production policy -----
    await serverWhen(page, (data) => data.setlists.some((list) => list.deletedAt === null && list.items.length === 1));
    const strict = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' });
    const guarded = await strict.newPage();
    const violations = await enforcePolicy(strict, guarded);
    await signIn(guarded, BASE);
    await openSection(guarded, 'Listados');
    await guarded.getByRole('link', { name: /Misa del/ }).click();
    await guarded.locator('section.slot').first().waitFor();
    await guarded.getByRole('link', { name: 'Cantar' }).click();
    await guarded.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    await guarded.getByRole('button', { name: 'Más herramientas' }).click();
    await guarded.getByRole('button', { name: 'Subir un semitono' }).click();
    await guarded.keyboard.press('Escape');
    await guarded.getByRole('button', { name: /Ir a otro canto/ }).click();
    await guarded.getByRole('dialog', { name: 'Cantos del listado' }).waitFor();
    assert.deepEqual(violations, [], 'nothing the policy forbids');
    pass('the list screens and singing run under the production Content-Security-Policy');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
