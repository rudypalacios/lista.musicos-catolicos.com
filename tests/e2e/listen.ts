/**
 * Browser test of the link to hear the original of a song: the field of the editor says what it understood; the way in is an option of
 * the "⋯" sheet of the song (its page, a row of a list, singing) and a ♪ in the rows of a list that have a link; on the page of the
 * song the player is YouTube's own frame above the lyrics (a column beside them on a wide screen), in a list and while singing it is a
 * sheet; any other link opens apart; nothing of YouTube is asked for before the touch, and closing takes the frame away. It all runs under the production Content-Security-Policy; YouTube itself is answered by a stand-in (no network is
 * needed, and none is used).
 *
 *     npm run build && node tests/e2e/listen.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, enforcePolicy, reporter, signIn, startServer, synced } from './lib.ts';
import type { BrowserContext, Page } from 'playwright';

const server = await startServer(18112);
const { pass, count } = reporter();

const ID = 'Zk3mPq8vLw4';
const YTM = `https://music.youtube.com/watch?v=${ID}&t=75s`;
const EMBED = `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0&start=75`;
const settle = (page: Page): Promise<void> => page.waitForTimeout(300);

/** The answer YouTube would give, so the frame has something to load */
async function standInForYouTube(context: BrowserContext): Promise<void> {
    await context.route(/youtube-nocookie\.com/, async (route) => {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title><p>stand-in</p>' });
    });
}

/** The option of the "⋯" sheet of the song page that plays it */
async function listenFromMenu(page: Page, name = 'Escuchar el original'): Promise<void> {
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.locator('.sheet-action', { hasText: name }).click();
}

async function createSong(page: Page, title: string, link: string): Promise<void> {
    await page.goto(`${server.base}/cantos/nuevo`);
    await page.getByLabel('Título').fill(title);
    await page.locator('#body').fill('[G]Caminamos con a[D]legría, Se[Em]ñor,\n[C]cantando va[G]mos hacia tu [D]casa.');
    if (link !== '') {
        await page.getByLabel('Enlace para escuchar').fill(link);
    }
    await page.getByRole('button', { name: 'Guardar' }).click();
}

const browser = await chromium.launch();
try {
    const problems: string[] = [];
    const askedLog: string[] = [];
    /** What was asked of YouTube so far (a copy, so what is checked is what was asked at that moment) */
    const asked = (): string[] => [...askedLog];
    const phoneContext = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
    const phone = await phoneContext.newPage();
    phone.on('pageerror', (error) => problems.push(error.message));
    phone.on('request', (request) => {
        if (/youtube/.test(request.url())) {
            askedLog.push(request.url());
        }
    });
    const violations = await enforcePolicy(phoneContext, phone);
    await standInForYouTube(phoneContext);
    await signIn(phone, server.base);

    // The editor: what it understood of what was pasted
    await phone.goto(`${server.base}/cantos/nuevo`);
    const field = phone.getByLabel('Enlace para escuchar');
    const hint = phone.locator('#listen-hint');
    assert.match(await hint.innerText(), /Opcional/);
    await field.fill(YTM);
    assert.match(await hint.innerText(), /Listo: YouTube Music, arranca en 1:15\. Se podrá escuchar aquí/);
    await field.fill('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    assert.match(await hint.innerText(), /Spotify: se abrirá aparte/);
    await field.fill('caminamos con alegría');
    assert.match(await hint.innerText(), /enlace completo/);
    pass('the field of the editor says what it understood: a YouTube Music video, another site, or what is wrong');

    // A link that is not one is refused when saving, with the reason, and the person stays
    await phone.getByLabel('Título').fill('Con enlace malo');
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('p.error').filter({ hasText: /enlace/ }).first().waitFor();
    assert.ok(phone.url().endsWith('/cantos/nuevo'), 'still in the editor');
    pass('a text that is not a link is refused when saving, with the reason');

    // A song with a YouTube Music link: no row (the lyrics keep the screen), an option in the "⋯" sheet, and nothing of YouTube until the touch
    await createSong(phone, 'Caminamos', YTM);
    await phone.locator('.song-sheet').waitFor();
    assert.equal(await phone.locator('.song-listen').count(), 0, 'no row between the tools and the lyrics');
    assert.equal(await phone.locator('.song-player').count(), 0, 'no player yet');
    assert.equal(await phone.locator('iframe').count(), 0, 'no frame yet');
    const tools = await phone.locator('.song-tools').boundingBox();
    const stageTop = await phone.locator('#stage').boundingBox();
    assert.ok(tools !== null && stageTop !== null && Math.abs(stageTop.y - (tools.y + tools.height)) <= 1, 'the lyrics begin right under the tools');
    await phone.getByRole('button', { name: 'Más opciones' }).click();
    const option = phone.locator('.sheet-action', { hasText: 'Escuchar el original' });
    await option.waitFor();
    assert.match(await option.innerText(), /YouTube Music · arranca en 1:15/);
    assert.deepEqual(asked(), [], 'nothing of YouTube was asked for before the touch');
    pass('a song with a link has an option in its "⋯" sheet and no row: the lyrics keep the screen, and nothing of YouTube is loaded');

    // The touch: the sheet goes and YouTube's frame is above the lyrics, built from the id, with the lyrics still in sight
    await option.click();
    const frame = phone.locator('.song-player iframe');
    await frame.waitFor();
    assert.equal(await frame.getAttribute('src'), EMBED, 'the address is built from the video id and the start');
    assert.equal(await frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    assert.match((await frame.getAttribute('sandbox')) ?? '', /allow-scripts/);
    assert.ok(!/allow-top-navigation/.test((await frame.getAttribute('sandbox')) ?? ''), 'the frame cannot navigate the page');
    assert.match((await frame.getAttribute('allow')) ?? '', /autoplay/);
    assert.equal(asked().length > 0 && asked().every((url) => url.startsWith('https://www.youtube-nocookie.com/embed/')), true, 'only the player was asked for');
    const screen = await phone.locator('.song-player__screen').boundingBox();
    assert.ok(screen !== null && screen.height >= 200 && Math.abs(screen.width - 390) <= 1, `16:9 across the width, not under 200px (${screen?.width}×${screen?.height})`);
    assert.match(await phone.locator('.song-player__what').innerText(), /YouTube Music · arranca en 1:15/);
    const stage = await phone.locator('#stage').boundingBox();
    assert.ok(stage !== null && screen !== null && stage.y >= screen.y + screen.height - 1, 'the lyrics are under the player');
    assert.equal(await phone.locator('.song-sheet .ch').first().isVisible(), true, 'and the chords are in sight');
    assert.deepEqual(violations, [], 'the frame breaks no rule of the Content-Security-Policy');
    pass('the option opens YouTube\'s own frame above the lyrics, built from the id, 16:9 across the width, under the production policy');

    // ✕ takes the frame away (that is what ends the sound)
    await phone.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    assert.equal(await phone.locator('iframe').count(), 0, 'the frame is gone');
    await listenFromMenu(phone);
    await phone.locator('.song-player iframe').waitFor();
    await phone.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    assert.equal(await phone.locator('.song-player').count(), 0);
    pass('✕ takes the frame away, which ends the sound');

    // The ♪ of the tools row (the owner: the same icon as in the rows of a list): before the "⋯", toggles the player
    const heard = phone.locator('.song-tools__listen');
    const heardBox = await heard.boundingBox();
    const dotsBox = await phone.getByRole('button', { name: 'Más opciones' }).boundingBox();
    const rowBox = await phone.locator('.song-tools__row').boundingBox();
    assert.ok(heardBox !== null && dotsBox !== null && rowBox !== null, 'the ♪ is in the tools row');
    assert.ok(heardBox.x + heardBox.width <= dotsBox.x + 1 && heardBox.width >= 40 && rowBox.height <= 50, `just before the "⋯", the row does not wrap (${Math.round(rowBox.height)}px)`);
    assert.equal(await heard.getAttribute('aria-pressed'), 'false');
    await heard.click();
    await phone.locator('.song-player iframe').waitFor();
    assert.equal(await heard.getAttribute('aria-pressed'), 'true', 'it shows the player is open');
    await heard.click();
    assert.equal(await phone.locator('.song-player').count(), 0, 'a second touch closes it');
    assert.equal(await heard.getAttribute('aria-pressed'), 'false');
    pass('the song page has the same ♪ before the "⋯": it opens and closes the player, and the tools row keeps one line');

    // Offline: it says so, and the lyrics stay
    await phoneContext.setOffline(true);
    await listenFromMenu(phone);
    await phone.locator('.song-player__msg').waitFor();
    assert.match(await phone.locator('.song-player__msg').innerText(), /Sin conexión/);
    assert.equal(await phone.locator('iframe').count(), 0, 'no frame to load nothing');
    assert.equal(await phone.locator('.song-sheet .ch').first().isVisible(), true);
    await phone.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    await phoneContext.setOffline(false);
    pass('with no connection the player says so and the lyrics stay');

    // Going to another page closes the player: no sound is left behind
    await listenFromMenu(phone);
    await phone.locator('.song-player iframe').waitFor();
    await phone.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: 'Cantos', exact: true }).click();
    await phone.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.equal(await phone.locator('iframe').count(), 0, 'leaving the song takes the player with it');
    pass('leaving the song takes the player with it');

    // Any other link: the option opens it apart, there is no player
    await createSong(phone, 'Con Spotify', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    await phone.locator('.song-sheet').waitFor();
    await phone.evaluate(() => {
        (window as unknown as { opened: unknown[][] }).opened = [];
        window.open = ((...args: unknown[]) => {
            (window as unknown as { opened: unknown[][] }).opened.push(args);

            return null;
        }) as typeof window.open;
    });
    await phone.getByRole('button', { name: 'Más opciones' }).click();
    await phone.getByRole('button', { name: 'Escuchar en Spotify' }).click();
    const opened = await phone.evaluate(() => (window as unknown as { opened: unknown[][] }).opened);
    assert.deepEqual(opened, [['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', '_blank', 'noopener,noreferrer']], 'opened apart, with no opener');
    assert.equal(await phone.locator('.song-player').count(), 0, 'no player for it');
    pass('another site opens apart (in another tab, with no opener) and has no player');

    // No link, no row
    await createSong(phone, 'Sin enlace', '');
    await phone.locator('.song-sheet').waitFor();
    await phone.getByRole('button', { name: 'Más opciones' }).click();
    await phone.getByRole('button', { name: 'Agregar a un listado' }).waitFor();
    assert.equal(await phone.getByRole('button', { name: /Escuchar/ }).count(), 0, 'no option in its sheet');
    await phone.keyboard.press('Escape');
    pass('a song with no link has no option');

    // A link in the editor of a song that exists is kept, changed and taken away
    await phone.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: 'Cantos', exact: true }).click();
    await phone.getByRole('link', { name: /Caminamos/ }).first().click();
    await phone.locator('.song-sheet').waitFor();
    await phone.getByRole('button', { name: 'Más opciones' }).click();
    await phone.getByRole('button', { name: 'Editar letra y acordes' }).click();
    assert.equal(await phone.getByLabel('Enlace para escuchar').inputValue(), YTM, 'the link is there to be changed');
    await phone.getByLabel('Enlace para escuchar').fill('');
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('.song-sheet').waitFor();
    await phone.getByRole('button', { name: 'Más opciones' }).click();
    await phone.getByRole('button', { name: 'Agregar a un listado' }).waitFor();
    assert.equal(await phone.getByRole('button', { name: /Escuchar/ }).count(), 0, 'blank takes it away');
    await phone.keyboard.press('Escape');
    pass('the link of a song that exists is shown in its editor, and a blank one takes it away');

    // The policy the page runs under (the headers come from public/.htaccess, which the test server does not read)
    const htaccess = readFileSync('public/.htaccess', 'utf8');
    assert.match(htaccess, /frame-src https:\/\/www\.youtube-nocookie\.com/);
    assert.match(htaccess, /Referrer-Policy "strict-origin-when-cross-origin"/);
    assert.equal((htaccess.match(/https:\/\/[a-z.-]+/g) ?? []).filter((url) => !/youtube-nocookie/.test(url)).length, 0, 'no other domain is allowed');
    pass('the policy allows YouTube\'s privacy-friendly host and no other');

    // A wide screen: the player is a column at the right of the lyrics, which keep their height
    const wideContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const wide = await wideContext.newPage();
    wide.on('pageerror', (error) => problems.push(error.message));
    const wideViolations = await enforcePolicy(wideContext, wide);
    await standInForYouTube(wideContext);
    await signIn(wide, server.base);
    await createSong(wide, 'Caminamos ancho', YTM);
    await wide.locator('.song-sheet').waitFor();
    await listenFromMenu(wide);
    await wide.locator('.song-player iframe').waitFor();
    const column = await wide.locator('.song-player').boundingBox();
    const lyrics = await wide.locator('#stage').boundingBox();
    const sheet = await wide.locator('.song-sheet').boundingBox();
    assert.ok(column !== null && lyrics !== null && sheet !== null);
    assert.ok(column.x >= sheet.x + 100 && Math.abs(column.width - 384) <= 2, `a column at the right (${Math.round(column.x)}, ${Math.round(column.width)} wide)`);
    assert.ok(column.y < lyrics.y + 200 && lyrics.height > 400, 'the lyrics keep their height');
    assert.ok(Math.abs(column.y - lyrics.y) < 200 && sheet.x + sheet.width <= column.x, 'and do not go under the player');
    assert.deepEqual(wideViolations, [], 'no rule of the policy is broken');
    pass('on a wide screen the player is a column at the right of the lyrics');

    // ---------- a list: a ♪ in the rows that have a link, and the option in their "⋯"; the player is a sheet ----------
    await phone.goto(`${server.base}/`);
    await synced(phone);
    await phone.evaluate(async () => {
        const id = (): string => crypto.randomUUID();
        const now = Date.now();
        const body = '[G]Caminamos con a[D]legría';
        const songs = [
            ['Uno con YouTube', 'Autor 1', 'https://music.youtube.com/watch?v=Zk3mPq8vLw4&t=75s'],
            ['Dos sin enlace', 'Autor 2', ''],
            ['Tres con Spotify', 'Autor 3', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'],
        ].map(([title, author, listenUrl]) => ({ id: id(), title, author, body, tags: [], status: 'published', listenUrl, updatedAt: now, deleted: false }));
        const list = {
            id: id(), title: 'Con enlaces', eventDate: null, notes: '', updatedAt: now, deleted: false,
            parts: [{ id: 'entrada', name: 'Entrada' }],
            items: songs.map((song) => ({ id: id(), part: 'entrada', songId: song.id, transpose: 0, note: '' })),
        };
        const answer = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ songs, setlists: [list] }) });
        if (!answer.ok) {
            throw new Error(await answer.text());
        }
    });
    await phone.reload();
    await synced(phone);
    await phone.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: 'Listados', exact: true }).click();
    await phone.getByRole('link', { name: /Con enlaces/ }).first().click();
    await phone.locator('.item').first().waitFor();
    const askedBefore = asked().length;
    assert.equal(await phone.locator('.item__listen').count(), 2, 'a ♪ in the two rows that have a link, none in the one that has not');
    assert.equal(await phone.locator('.item', { hasText: 'Dos sin enlace' }).locator('.item__listen').count(), 0);
    const note = phone.getByRole('button', { name: 'Escuchar el original: Uno con YouTube' });
    const more = phone.getByRole('button', { name: 'Más opciones: Uno con YouTube' });
    const noteBox = await note.boundingBox();
    const moreBox = await more.boundingBox();
    assert.ok(noteBox !== null && moreBox !== null && noteBox.width >= 44 && noteBox.height >= 44 && noteBox.x + noteBox.width <= moreBox.x + 1, 'a 44px button just before the "⋯"');
    assert.equal(asked().length, askedBefore, 'nothing of YouTube is asked for by the list being there');
    pass('in a list the rows with a link have a ♪ (a 44px button before the "⋯"), the others have nothing');

    // The ♪ opens the player in a sheet: it covers nothing that matters, and closing (✕, back) takes the frame away
    await note.click();
    const listFrame = phone.locator('.sheet iframe');
    await listFrame.waitFor();
    assert.equal(await listFrame.getAttribute('src'), EMBED);
    assert.match(await phone.locator('.sheet[aria-label="Escuchar el original"] .sheet__title').innerText(), /Uno con YouTube/);
    assert.match(await phone.locator('.sheet[aria-label="Escuchar el original"] .sheet__sub').innerText(), /Autor 1 · YouTube Music · arranca en 1:15/);
    const sheetScreen = await phone.locator('.sheet .song-player__screen').boundingBox();
    assert.ok(sheetScreen !== null && sheetScreen.height >= 200, `the player in the sheet is not under 200px (${sheetScreen?.height})`);
    await phone.getByRole('button', { name: 'Cerrar' }).click();
    await settle(phone);
    assert.equal(await phone.locator('.sheet iframe').count(), 0, 'closing the sheet takes the frame away');
    await note.click();
    await listFrame.waitFor();
    await phone.goBack();
    await settle(phone);
    assert.equal(await phone.locator('.sheet iframe').count(), 0, 'the back button closes the sheet and ends the sound');
    assert.ok(phone.url().includes('/listados/'), 'and stays in the list');
    assert.deepEqual(violations, [], 'no rule of the policy is broken');
    pass('the ♪ opens the player in a sheet; the cross and the back button close it and end the sound');

    // The option of the song's "⋯" does the same; the one of another site opens apart; a song with no link has none
    await more.click();
    await phone.locator('.sheet-action', { hasText: 'Escuchar el original' }).click();
    await listFrame.waitFor();
    await phone.getByRole('button', { name: 'Cerrar' }).click();
    await settle(phone);
    await phone.getByRole('button', { name: 'Más opciones: Dos sin enlace' }).click();
    await phone.getByRole('button', { name: 'Cantar desde aquí' }).waitFor();
    assert.equal(await phone.locator('.sheet-action', { hasText: /Escuchar/ }).count(), 0, 'no option for a song with no link');
    await phone.keyboard.press('Escape');
    await settle(phone);
    const spotifyNote = phone.getByRole('link', { name: 'Escuchar en Spotify: Tres con Spotify' });
    assert.equal(await spotifyNote.getAttribute('href'), 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    assert.equal(await spotifyNote.getAttribute('target'), '_blank');
    assert.match((await spotifyNote.getAttribute('rel')) ?? '', /noopener/);
    pass('the option of the "⋯" plays it too; another site is a link that opens apart; a song with no link has no option');

    // Singing: the option is in the sheet of the "⋯", and the player comes in a sheet over the lyrics
    await phone.getByRole('link', { name: 'Cantar' }).first().click();
    await phone.locator('.perform').waitFor();
    await phone.getByRole('button', { name: 'Más herramientas' }).click();
    const singOption = phone.getByRole('button', { name: 'Escuchar el original' });
    await singOption.waitFor();
    assert.match(await singOption.innerText(), /YouTube Music · arranca en 1:15/);
    await singOption.click();
    await phone.locator('.sheet iframe').waitFor();
    assert.equal(await phone.locator('.perform .song-player').count(), 0, 'it does not take room from the lyrics: it is a sheet');
    await phone.getByRole('button', { name: 'Cerrar' }).click();
    await settle(phone);
    assert.equal(await phone.locator('.sheet iframe').count(), 0);
    assert.equal(await phone.locator('.perform .song-sheet').first().isVisible(), true, 'the lyrics are there again');
    pass('while singing the option is in the sheet of the "⋯", and the player is a sheet that goes away with the lyrics where they were');

    // On a wide screen the singing bar has room: the same ♪, beside the key; under 900px it is not there (the option stays in the sheet)
    assert.equal(await phone.locator('.perform__listen').isVisible(), false, 'no ♪ in the bar of a phone');
    await phone.setViewportSize({ width: 1280, height: 800 });
    await settle(phone);
    const barNote = phone.locator('.perform__listen');
    await barNote.waitFor();
    const toneBox = await phone.locator('.perform__tone').boundingBox();
    const noteBarBox = await barNote.boundingBox();
    assert.ok(toneBox !== null && noteBarBox !== null && noteBarBox.x >= toneBox.x + toneBox.width - 1 && Math.abs(noteBarBox.y - toneBox.y) < 30, 'beside the key, in the bar');
    await barNote.click();
    await phone.locator('.sheet iframe').waitFor();
    await phone.getByRole('button', { name: 'Cerrar' }).click();
    await settle(phone);
    assert.equal(await phone.locator('.sheet iframe').count(), 0);
    pass('on a wide screen the singing bar has the same ♪ beside the key, and it opens the player in a sheet');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
