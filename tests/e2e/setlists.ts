/**
 * Browser test of phase 2: setlists. Create a list for a Mass, fill the slots of the template
 * from the library, change the key of a song for that list only, move and annotate songs, sing
 * the list (also with no connection), see it on a second device, and delete a song that is in a
 * list. The real PHP server on a throwaway SQLite database, Chromium with an iPad and a phone.
 *
 *     npm run build && node tests/e2e/setlists.ts
 */
import assert from 'node:assert/strict';
import { chromium, enforcePolicy, reporter, signIn, startServer, synced } from './lib.ts';
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
    await page.getByRole('link', { name: 'Cantos', exact: true }).click();
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Letra con acordes').fill(body);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

/** The slot of a part of the Mass, by its name */
function slot(page: Page, part: string) {
    return page.locator('section.slot', { has: page.getByRole('heading', { name: part, exact: true }) });
}

async function addToSlot(page: Page, part: string, song: string): Promise<void> {
    await page.getByRole('link', { name: `Agregar canto a ${part}` }).click();
    await page.getByRole('heading', { name: `Agregar a ${part}` }).waitFor();
    await page.getByLabel('Buscar cantos').fill(song);
    await page.getByRole('button', { name: new RegExp(song) }).click();
    await page.getByRole('link', { name: '← Listados' }).waitFor();
}

/** What the song on screen shows as chords */
async function chords(page: Page): Promise<string[]> {
    await page.locator('#song-sheet .ch').first().waitFor();

    return page.locator('#song-sheet .ch').allTextContents();
}

async function serverData(page: Page) {
    return page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as {
            songs: { id: string; title: string; body: string; deletedAt: number | null }[];
            setlists: {
                id: string; title: string; eventDate: string | null; notes: string; deletedAt: number | null;
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
    await page.getByRole('link', { name: 'Listados', exact: true }).click();
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

    // ----- the key, for this list only -----
    const entrada = slot(page, 'Canto de entrada');
    assert.equal(await entrada.locator('button.key').textContent(), 'Do');
    await entrada.getByRole('button', { name: /Subir un semitono/ }).click();
    await entrada.getByRole('button', { name: /Subir un semitono/ }).click();
    await entrada.locator('button.key', { hasText: 'Re ↺' }).waitFor();
    pass('a song can be raised two semitones in the list (Do → Re)');

    await page.getByRole('link', { name: 'Cantos', exact: true }).click();
    await page.getByRole('link', { name: 'Abrimos la puerta' }).click();
    assert.deepEqual(await chords(page), ['Do', 'Sol']);
    pass('the song itself keeps its own key');
    await page.getByRole('link', { name: 'Listados', exact: true }).click();
    await page.locator('.song-list .song-item').first().click();
    await page.locator('section.slot').first().waitFor();
    await slot(page, 'Canto de entrada').locator('button.key', { hasText: 'Re ↺' }).waitFor();
    pass('and the list remembers the key after leaving the screen');

    // ----- moving, noting, quitting -----
    const comunion = slot(page, 'Canto de comunión');
    await comunion.getByRole('button', { name: 'Mover arriba: Gloria sencilla' }).click();
    await page.waitForFunction(() => document.querySelector('section.slot[data-part="comunion"] .item__title')?.textContent === 'Gloria sencilla');
    assert.equal(await comunion.getByRole('button', { name: 'Mover arriba: Gloria sencilla' }).isDisabled(), true);
    pass('a song moves up within its slot, and the first one cannot go higher');

    // A note is out of the way until asked for: no field, just a "Nota" button
    assert.equal(await comunion.getByLabel('Nota para Pan de vida').count(), 0);
    await comunion.getByRole('button', { name: 'Agregar una nota a Pan de vida' }).click();
    await comunion.getByLabel('Nota para Pan de vida').fill('Sin el último coro');
    await page.getByLabel('Título').click(); // leaving the field saves it and closes it
    await comunion.getByRole('button', { name: 'Editar la nota de Pan de vida' }).waitFor();
    await synced(page);
    await page.reload();
    await page.locator('section.slot').first().waitFor();
    await slot(page, 'Canto de comunión').getByRole('button', { name: 'Editar la nota de Pan de vida' }).click();
    assert.equal(await slot(page, 'Canto de comunión').getByLabel('Nota para Pan de vida').inputValue(), 'Sin el último coro');
    pass('a note on a song is one quiet line, opens to edit, is kept (and survives a reload)');

    // A title cannot be emptied: it says so, in Spanish, and the list keeps the old one
    const oldTitle = await page.getByLabel('Título').inputValue();
    await page.getByLabel('Título').fill('   ');
    await page.getByLabel('Título').blur();
    await page.getByText('El listado necesita un título.').waitFor();
    pass('an empty title is refused with a message');
    await page.getByLabel('Título').fill(oldTitle);

    // Typing in a note and putting it back must not leave the screen frozen
    await slot(page, 'Canto de comunión').getByRole('button', { name: 'Agregar una nota a Gloria sencilla' }).click();
    const quiet = slot(page, 'Canto de comunión').getByLabel('Nota para Gloria sencilla');
    await quiet.fill('x');
    await quiet.fill('');
    await quiet.blur();
    await slot(page, 'Canto de entrada').getByRole('button', { name: /Subir un semitono/ }).click();
    await slot(page, 'Canto de entrada').locator('button.key', { hasText: 'Mib ↺' }).waitFor();
    await slot(page, 'Canto de entrada').getByRole('button', { name: /Bajar un semitono/ }).click();
    await slot(page, 'Canto de entrada').locator('button.key', { hasText: 'Re ↺' }).waitFor();
    pass('a note typed and put back as it was does not freeze the screen');

    await page.getByLabel('Título').fill('Domingo de prueba');
    await page.getByLabel('Notas del listado').fill('Misa de las diez');
    await page.getByLabel('Fecha de la misa').fill('2026-11-01');
    await page.getByLabel('Notas del listado').blur();
    const afterHeader = await serverWhen(page, (data) => data.setlists[0]?.notes === 'Misa de las diez');
    const stored = afterHeader.setlists[0];
    assert.equal(stored?.title, 'Domingo de prueba');
    assert.equal(stored?.eventDate, '2026-11-01');
    assert.equal(stored?.notes, 'Misa de las diez');
    assert.deepEqual(stored?.items.map((item) => [item.part, item.transpose, item.note]), [
        ['entrada', 2, ''], ['comunion', 0, ''], ['comunion', 0, 'Sin el último coro'],
    ]);
    pass('title, day, notes, order, keys and notes reach the server');

    // The same song in two parts: allowed, with a quiet notice on both (and in the picker beforehand)
    await page.getByRole('link', { name: 'Agregar canto a Canto de salida' }).click();
    await page.getByLabel('Buscar cantos').fill('puerta');
    await page.getByText('Ya está en Canto de entrada').waitFor();
    await page.getByRole('button', { name: /Abrimos la puerta/ }).click();
    await slot(page, 'Canto de salida').locator('.item__title').waitFor();
    await slot(page, 'Canto de salida').getByText('También está en: Canto de entrada').waitFor();
    await slot(page, 'Canto de entrada').getByText('También está en: Canto de salida').waitFor();
    assert.equal(await slot(page, 'Canto de comunión').locator('.item__also').count(), 0);
    pass('the same song in two parts is allowed, with a notice in the picker and on both rows');
    await slot(page, 'Canto de salida').getByRole('button', { name: 'Quitar Abrimos la puerta del listado' }).click();
    await slot(page, 'Canto de salida').locator('.item').waitFor({ state: 'detached' });
    await slot(page, 'Canto de entrada').locator('.item__also').waitFor({ state: 'detached' });

    // ----- singing the list -----
    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    assert.equal(await page.locator('.perform__count').textContent(), '1/3');
    assert.deepEqual(await chords(page), ['Re', 'La']);
    assert.match(await page.locator('.perform__info').innerText(), /Canto de entrada/);
    assert.equal(await page.locator('.tabs').isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Canto anterior' }).isDisabled(), true);
    pass('singing opens the first song in the key of the list, with its part and no tabs in the way');

    await page.getByRole('button', { name: 'Canto siguiente' }).click();
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.equal(await page.locator('.perform__count').textContent(), '2/3');
    assert.deepEqual(await chords(page), ['Sol', 'Re']);
    assert.match(await page.locator('.perform__info').innerText(), /Canto de comunión/);
    pass('next goes to the following song, in the order of the Mass');

    await page.keyboard.press('ArrowRight');
    await page.getByRole('heading', { name: 'Pan de vida' }).waitFor();
    assert.doesNotMatch(await page.locator('.perform__info').innerText(), /Sin el último coro/);
    await page.getByRole('button', { name: '📝 Nota' }).click();
    assert.match(await page.locator('.perform__info').innerText(), /Sin el último coro/);
    assert.equal(await page.getByRole('button', { name: 'Canto siguiente' }).isDisabled(), true);
    await page.keyboard.press('ArrowLeft');
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    pass('the arrow keys move between songs, and the note of the item is one tap away, not in the way');

    await swipe(page, 600, 200);
    await page.getByRole('heading', { name: 'Pan de vida' }).waitFor();
    assert.ok(await page.locator('.stage.slide-in-next').count() > 0, 'the next song slides in');
    await swipe(page, 200, 600);
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    await swipe(page, 300, 330); // too short to count
    await swipe(page, 200, 190);
    assert.equal(await page.locator('.perform__count').textContent(), '2/3');
    pass('a swipe moves between songs; a small move does not');

    await page.getByRole('button', { name: 'Subir un semitono' }).click();
    await page.waitForFunction(() => document.querySelector('#song-sheet .ch')?.textContent === 'Lab');
    assert.deepEqual(await chords(page), ['Lab', 'Mib']);
    const afterShift = await serverWhen(page, (data) =>
        data.setlists[0]?.items.find((item) => item.part === 'comunion' && item.note === '')?.transpose === 1);
    assert.equal(afterShift.setlists[0]?.items.length, 3);
    assert.equal(afterShift.songs.find((song) => song.title === 'Gloria sencilla')?.body, SONGS[1]?.[1], 'the song on the server is unchanged');
    pass('changing the key while singing is saved to the item of the list, not to the song');

    // ----- offline -----
    await ipad.setOffline(true);
    await page.reload();
    await page.getByRole('heading', { name: 'Gloria sencilla' }).waitFor();
    assert.deepEqual(await chords(page), ['Lab', 'Mib']);
    await page.getByRole('button', { name: 'Canto anterior' }).click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    assert.deepEqual(await chords(page), ['Re', 'La']);
    pass('offline: a reload of the singing screen still shows the songs, in the keys of the list');

    await page.getByRole('link', { name: '← Listado' }).click();
    await page.locator('section.slot').first().waitFor();
    await slot(page, 'Canto de entrada').getByRole('button', { name: /Bajar un semitono/ }).click();
    await slot(page, 'Canto de entrada').locator('button.key', { hasText: 'Do# ↺' }).waitFor();
    await page.getByText(/Sin conexión · 1 sin enviar/).waitFor();
    pass('offline: editing the list works and is counted as unsent');
    await ipad.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await synced(page);

    // ----- a second device -----
    const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const second = await tablet.newPage();
    await signIn(second, BASE);
    await second.getByRole('link', { name: 'Listados', exact: true }).click();
    await second.getByRole('link', { name: /Domingo de prueba/ }).click();
    await second.locator('section.slot').first().waitFor();
    await slot(second, 'Canto de entrada').locator('button.key', { hasText: 'Do# ↺' }).waitFor();
    assert.equal(await slot(second, 'Canto de comunión').locator('.item').count(), 2);
    pass('a second device receives the list with its keys and songs');

    await second.getByLabel('Título').fill('Domingo, editado en la tablet');
    await second.getByLabel('Título').blur();
    await synced(second);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.getByRole('link', { name: '← Listados' }).click();
    await page.getByRole('link', { name: /Domingo, editado en la tablet/ }).waitFor();
    pass('an edit of the list made on one device shows up on the other');

    // ----- deleting a song that is in a list -----
    await page.getByRole('link', { name: 'Cantos', exact: true }).click();
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
    await page.getByRole('link', { name: 'Listados', exact: true }).click();
    await page.getByRole('link', { name: /Domingo, editado en la tablet/ }).click();
    await slot(page, 'Canto de comunión').getByText('Canto eliminado').waitFor();
    assert.equal(await slot(page, 'Canto de comunión').locator('button.key').count(), 1, 'a deleted song has no key to change');
    pass('the list shows "Canto eliminado" where the song was');

    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.getByRole('button', { name: 'Canto siguiente' }).click();
    await page.getByRole('button', { name: 'Canto siguiente' }).click();
    await page.getByRole('heading', { name: 'Canto eliminado' }).waitFor();
    await page.getByRole('button', { name: 'Canto anterior' }).click();
    pass('singing a list with a deleted song says so and keeps going');

    await page.getByRole('link', { name: '← Listado' }).click();
    await page.getByRole('button', { name: 'Quitar Canto eliminado del listado' }).click();
    await page.getByText('2 cantos').waitFor();
    pass('the deleted song can be removed from the list');

    // ----- deleting the list -----
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Eliminar listado' }).click();
    await page.getByRole('heading', { name: 'Listados' }).waitFor();
    await page.getByText('Todavía no hay listados.').waitFor();
    await synced(page);
    assert.ok((await serverData(page)).setlists.every((list) => list.deletedAt !== null));
    await second.evaluate(() => window.dispatchEvent(new Event('online')));
    await second.getByText('Todavía no hay listados.').waitFor({ timeout: 15000 }).catch(async () => {
        await second.getByRole('link', { name: 'Listados', exact: true }).click();
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

    // Back from a song returns to the same place in the list (the list is long on a phone)
    await page.evaluate(() => {
        const view = document.querySelector('#view');
        if (view !== null) {
            view.scrollTop = 600;
        }
    });
    const before = await page.evaluate(() => document.querySelector('#view')?.scrollTop ?? 0);
    assert.ok(before > 0, 'the list is long enough to scroll');
    await slot(page, 'Canto de salida').getByRole('link', { name: 'Abrimos la puerta' }).click();
    await page.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    await page.goBack();
    await page.locator('section.slot').first().waitFor();
    await page.waitForFunction((top) => (document.querySelector('#view')?.scrollTop ?? 0) >= top - 2, before);
    pass('back from a song returns to the same place in the list');

    // A desktop: the parts in two columns, the tools of each song on one line
    await page.setViewportSize({ width: 1280, height: 800 });
    const columns = await page.evaluate(() => getComputedStyle(document.querySelector('.slots') as Element).gridTemplateColumns.split(' ').length);
    assert.equal(columns, 2);
    const rowHeight = await page.locator('#parte-salida .item').first().evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(rowHeight < 110, `a song takes one compact row on a desktop (got ${rowHeight}px)`);
    pass('on a desktop the parts go in two columns and each song takes one compact row');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no uncaught errors in the page');

    // ----- under the production policy -----
    await serverWhen(page, (data) => data.setlists.some((list) => list.deletedAt === null && list.items.length === 1));
    const strict = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' });
    const guarded = await strict.newPage();
    const violations = await enforcePolicy(strict, guarded);
    await signIn(guarded, BASE);
    await guarded.getByRole('link', { name: 'Listados', exact: true }).click();
    await guarded.getByRole('link', { name: /Misa del/ }).click();
    await guarded.locator('section.slot').first().waitFor();
    await guarded.getByRole('link', { name: 'Cantar' }).click();
    await guarded.getByRole('heading', { name: 'Abrimos la puerta' }).waitFor();
    await guarded.getByRole('button', { name: 'Subir un semitono' }).click();
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
