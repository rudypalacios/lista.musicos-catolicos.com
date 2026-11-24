/**
 * Browser test of the link to hear the original of a song: the field of the editor says what it understood, the page of the song
 * has a row ("Escuchar aquí" for YouTube and YouTube Music, a button that opens apart for any other link), the player is YouTube's own
 * frame above the lyrics (a column beside them on a wide screen), nothing of YouTube is asked for before the touch, and ✕ takes the
 * frame away. It all runs under the production Content-Security-Policy; YouTube itself is answered by a stand-in (no network is
 * needed, and none is used).
 *
 *     npm run build && node tests/e2e/listen.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, enforcePolicy, reporter, signIn, startServer } from './lib.ts';
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

    // A song with a YouTube Music link: the row, and nothing of YouTube until the touch
    await createSong(phone, 'Caminamos', YTM);
    await phone.locator('.song-sheet').waitFor();
    const play = phone.getByRole('button', { name: 'Escuchar aquí' });
    await play.waitFor();
    assert.equal(await phone.locator('.song-player').count(), 0, 'no player yet');
    assert.equal(await phone.locator('iframe').count(), 0, 'no frame yet');
    assert.deepEqual(asked(), [], 'nothing of YouTube was asked for before the touch');
    const tools = await phone.locator('.song-tools').boundingBox();
    const row = await phone.locator('.song-listen').boundingBox();
    assert.ok(tools !== null && row !== null && Math.abs(row.y - (tools.y + tools.height)) <= 1, 'the row sits right under the tools, as the lyrics begin');
    pass('a song with a link has the row under its tools, and nothing of YouTube is loaded before the touch');

    // The touch: YouTube's frame above the lyrics, built from the id, with the lyrics still in sight
    await play.click();
    const frame = phone.locator('.song-player iframe');
    await frame.waitFor();
    assert.equal(await frame.getAttribute('src'), EMBED, 'the address is built from the video id and the start');
    assert.equal(await frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    assert.match((await frame.getAttribute('sandbox')) ?? '', /allow-scripts/);
    assert.ok(!/allow-top-navigation/.test((await frame.getAttribute('sandbox')) ?? ''), 'the frame cannot navigate the page');
    assert.match((await frame.getAttribute('allow')) ?? '', /autoplay/);
    assert.equal(await play.getAttribute('aria-pressed'), 'true');
    assert.equal(asked().length > 0 && asked().every((url) => url.startsWith('https://www.youtube-nocookie.com/embed/')), true, 'only the player was asked for');
    const screen = await phone.locator('.song-player__screen').boundingBox();
    assert.ok(screen !== null && screen.height >= 200 && Math.abs(screen.width - 390) <= 1, `16:9 across the width, not under 200px (${screen?.width}×${screen?.height})`);
    assert.match(await phone.locator('.song-player__what').innerText(), /YouTube Music · arranca en 1:15/);
    const stage = await phone.locator('#stage').boundingBox();
    assert.ok(stage !== null && screen !== null && stage.y >= screen.y + screen.height - 1, 'the lyrics are under the player');
    assert.equal(await phone.locator('.song-sheet .ch').first().isVisible(), true, 'and the chords are in sight');
    assert.deepEqual(violations, [], 'the frame breaks no rule of the Content-Security-Policy');
    pass('the touch opens YouTube\'s own frame above the lyrics, built from the id, 16:9 across the width, under the production policy');

    // ✕ takes the frame away (that is what ends the sound), and the row is as it was
    await phone.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    assert.equal(await phone.locator('iframe').count(), 0, 'the frame is gone');
    assert.equal(await play.getAttribute('aria-pressed'), 'false');
    await play.click();
    await phone.locator('.song-player iframe').waitFor();
    await play.click();
    assert.equal(await phone.locator('iframe').count(), 0, 'the row button toggles it too');
    pass('✕ (and the row button) take the frame away, which ends the sound');

    // Offline: it says so, and the lyrics stay
    await phoneContext.setOffline(true);
    await play.click();
    await phone.locator('.song-player__msg').waitFor();
    assert.match(await phone.locator('.song-player__msg').innerText(), /Sin conexión/);
    assert.equal(await phone.locator('iframe').count(), 0, 'no frame to load nothing');
    assert.equal(await phone.locator('.song-sheet .ch').first().isVisible(), true);
    await phone.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    await phoneContext.setOffline(false);
    pass('with no connection the player says so and the lyrics stay');

    // Going to another page closes the player: no sound is left behind
    await play.click();
    await phone.locator('.song-player iframe').waitFor();
    await phone.getByRole('navigation', { name: 'Menú' }).getByRole('link', { name: 'Cantos', exact: true }).click();
    await phone.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.equal(await phone.locator('iframe').count(), 0, 'leaving the song takes the player with it');
    pass('leaving the song takes the player with it');

    // Any other link: a button that opens apart, no player
    await createSong(phone, 'Con Spotify', 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    await phone.locator('.song-sheet').waitFor();
    const apart = phone.getByRole('link', { name: 'Escuchar en Spotify' });
    assert.equal(await apart.getAttribute('target'), '_blank');
    assert.match((await apart.getAttribute('rel')) ?? '', /noopener/);
    assert.equal(await apart.getAttribute('href'), 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    assert.equal(await phone.getByRole('button', { name: 'Escuchar aquí' }).count(), 0, 'no player for it');
    pass('another site is a button that opens apart, with no player');

    // No link, no row
    await createSong(phone, 'Sin enlace', '');
    await phone.locator('.song-sheet').waitFor();
    assert.equal(await phone.locator('.song-listen').count(), 0);
    pass('a song with no link has no row');

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
    assert.equal(await phone.locator('.song-listen').count(), 0, 'blank takes it away');
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
    await wide.getByRole('button', { name: 'Escuchar aquí' }).click();
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

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
