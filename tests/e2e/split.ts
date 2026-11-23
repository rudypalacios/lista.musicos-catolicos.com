/**
 * Browser test of dividing a page while singing: two songs on one page, each in its square, on a wide screen (side by
 * side) and on a phone (one over the other). The union belongs to the list, so it is the same on both devices and the server
 * holds it. The bar and the key controls speak of the selected square; the page is what a swipe or an arrow moves.
 *
 *     npm run build && node tests/e2e/split.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18106);
const { pass, count } = reporter();
const BASE = server.base;

/** Four songs in four sections of a list, as the server would hold them; returns the list's id */
async function seedList(page: Page): Promise<string> {
    return page.evaluate(async () => {
        const id = (): string => crypto.randomUUID();
        const now = Date.now();
        const songs = [['Uno', 'C'], ['Dos', 'D'], ['Tres', 'E'], ['Cuatro', 'F']].map(([title, chord]) => ({
            id: id(), title, author: '', body: `{c: Coro}\n[${chord}]${title} canta`, tags: [], updatedAt: now, deleted: false,
        }));
        const parts = [['uno', 'Entrada'], ['dos', 'Aleluya'], ['tres', 'Aclamación'], ['cuatro', 'Ofertorio']].map(([partId, name]) => ({ id: partId, name }));
        const list = {
            id: id(), title: 'Prueba dividida', eventDate: null, notes: '', updatedAt: now, deleted: false, parts,
            items: songs.map((song, index) => ({ id: id(), part: parts[index]?.id, songId: song.id, transpose: 0, note: '' })),
        };
        const answer = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ songs, setlists: [list] }) });
        if (!answer.ok) {
            throw new Error(await answer.text());
        }

        return list.id;
    });
}

/** The titles in the bands of the page on screen, and the title the bar says */
const bands = (page: Page): Promise<string[]> => page.locator('.perform__band strong').allTextContents();
const barSays = (page: Page): Promise<string> => page.locator('.perform__song-name').innerText();
const positionOf = (page: Page): Promise<string> => page.locator('.perform__count').innerText();
const squares = (page: Page): Promise<number> => page.locator('.perform__pane').count();

async function sing(page: Page, listId: string, n: number): Promise<void> {
    // The list may still be on its way from the server (it was just pushed): look again once it has had time to arrive
    for (let attempt = 0; attempt < 3; attempt++) {
        await page.goto(`${BASE}/listados/${listId}/cantar/${n}`);
        try {
            await page.locator('.perform__song-name').waitFor({ timeout: 8000 });

            return;
        } catch {
            await synced(page);
        }
    }
    await page.locator('.perform__song-name').waitFor();
}

async function openTools(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Más herramientas' }).click();
    await page.locator('.sheet-layer.is-open .sheet-action').first().waitFor();
}

const browser = await chromium.launch();
try {
    const wide = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })).newPage();
    const problems: string[] = [];
    wide.on('pageerror', (error) => problems.push(error.message));
    await signIn(wide, BASE);
    await synced(wide);
    const listId = await seedList(wide);
    await wide.reload();
    await synced(wide);

    // Page 2 alone: the sheet offers to divide it with the next song (3)
    await sing(wide, listId, 2);
    assert.equal(await squares(wide), 1);
    assert.equal(await positionOf(wide), '2/4');
    await openTools(wide);
    const divide = wide.locator('.sheet-layer.is-open').getByRole('button', { name: /Dividir con el canto siguiente/ });
    assert.equal(await divide.isDisabled(), false);
    await divide.click();
    await wide.locator('.perform__panes.is-split').waitFor();
    assert.deepEqual(await bands(wide), ['Dos', 'Tres']);
    assert.equal(await positionOf(wide), '2–3/4');
    assert.equal(await barSays(wide), 'Dos', 'the bar speaks of the selected song, the first at the start');
    assert.equal(await wide.locator('.perform__panes').getAttribute('data-layout'), 'row', 'side by side on a wide screen');
    // One id each: the second square does not repeat them
    assert.equal(await wide.locator('#song-sheet').count(), 1);
    pass('dividing page 2 puts 2 and 3 in two squares, side by side, the bar on the first');

    // Touching a square selects it: the bar and the key controls answer to it, and the address names it
    await wide.locator('.perform__pane').nth(1).locator('.stage').click();
    assert.equal(await barSays(wide), 'Tres');
    assert.ok(wide.url().endsWith('/cantar/3'), 'the address names the selected song');
    const chordsBefore = await wide.locator('.perform__pane .song-sheet .ch').allTextContents();
    await wide.locator('.perform__tone').getByRole('button', { name: 'Subir un semitono' }).click();
    const chordsAfter = await wide.locator('.perform__pane .song-sheet .ch').allTextContents();
    assert.equal(chordsAfter[0], chordsBefore[0], 'the first square did not change');
    assert.notEqual(chordsAfter[1], chordsBefore[1], 'the selected one moved');
    const dock = wide.locator('.perform__dock');
    await dock.waitFor();
    assert.equal(await dock.locator('.perform__dock-who').textContent(), 'Aclamación', 'a divided page says which song the dock is about');
    await dock.getByRole('button', { name: 'Deshacer' }).click();
    await dock.waitFor({ state: 'hidden' });
    pass('the selected square answers to the bar, "Solo hoy" in the dock names it, and "Deshacer" goes back');

    // Notation is the device's: a change made for one square reaches the other
    await openTools(wide);
    const before = await wide.locator('.perform__pane .song-sheet .ch').allTextContents();
    await wide.locator('.sheet-layer.is-open').getByRole('button', { name: /Cambiar la notación/ }).click();
    const english = await wide.locator('.perform__pane .song-sheet .ch').allTextContents();
    assert.ok(before.every((chord, i) => chord !== english[i]), `both squares changed their notation (${before.join(' ')} → ${english.join(' ')})`);
    await wide.locator('.sheet-layer.is-open').getByRole('button', { name: /Cambiar la notación/ }).click();
    await wide.keyboard.press('Escape');

    // The page is what moves: after 2 and 3 comes 4, before them comes 1
    await wide.keyboard.press('ArrowRight');
    await wide.locator('.perform__count', { hasText: '4/4' }).waitFor();
    assert.equal(await squares(wide), 1);
    assert.equal(await positionOf(wide), '4/4');
    await openTools(wide);
    const last = wide.locator('.sheet-layer.is-open').getByRole('button', { name: /Dividir con el canto siguiente/ });
    assert.equal(await last.isDisabled(), true);
    assert.match(await wide.locator('.sheet-layer.is-open').innerText(), /último canto/, 'the last song says why it cannot be divided');
    await wide.keyboard.press('Escape');
    await wide.keyboard.press('ArrowLeft');
    await wide.locator('.perform__count', { hasText: '2–3/4' }).waitFor();
    assert.deepEqual(await bands(wide), ['Dos', 'Tres'], 'back on the divided page, on its first song');
    await wide.keyboard.press('ArrowLeft');
    await wide.locator('.perform__count', { hasText: '1/4' }).waitFor();
    assert.equal(await positionOf(wide), '1/4');
    pass('1 · 2 y 3 · 4: the arrows move by page, and the last song cannot be divided');

    // The union is the list's: it reaches the server and a phone sees it too, one square over the other
    await synced(wide);
    const held = await wide.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as { setlists: { items: { id: string; withNext?: string }[] }[] };
        const items = answer.setlists[0]?.items ?? [];

        return items.map((item) => (item.withNext === undefined ? '-' : items.findIndex((other) => other.id === item.withNext) + 1)).join();
    });
    assert.equal(held, '-,3,-,-', 'song 2 shares its page with song 3');
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' })).newPage();
    phone.on('pageerror', (error) => problems.push(error.message));
    await signIn(phone, BASE);
    await synced(phone);
    await sing(phone, listId, 3);
    assert.deepEqual(await bands(phone), ['Dos', 'Tres']);
    assert.equal(await barSays(phone), 'Tres', 'an address that names the second song selects it');
    assert.equal(await phone.locator('.perform__panes').getAttribute('data-layout'), 'column', 'one over the other on a phone');
    assert.equal(await phone.locator('.perform__tone').isVisible(), false, 'the key is in the "⋯" sheet on a phone');
    pass('the union is saved in the list: the server holds it and a phone shows the same page, one square over the other');

    // Whoever opens the link sees the same pages: the owner shared it with the union in it
    const code = await wide.evaluate(async (id) => {
        const answer = await fetch(`/api/lists/${id}/share`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ withLyrics: true }) });

        return ((await answer.json()) as { code: string }).code;
    }, listId);
    const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })).newPage();
    visitor.on('pageerror', (error) => problems.push(error.message));
    await visitor.goto(`${BASE}/c/${code}/2`);
    await visitor.locator('.perform__panes.is-split').waitFor();
    assert.deepEqual(await bands(visitor), ['Dos', 'Tres']);
    assert.equal(await visitor.locator('.pub-bar__line b').innerText(), 'Dos', 'the bar speaks of the selected song');
    assert.equal(await visitor.locator('.perform__jump').innerText(), '2–3/4');
    assert.equal(await visitor.locator('.perform__panes').getAttribute('data-layout'), 'row');
    await visitor.locator('.perform__pane').nth(1).locator('.stage').click();
    assert.equal(await visitor.locator('.pub-bar__line b').innerText(), 'Tres');
    assert.ok(visitor.url().endsWith(`/c/${code}/3`), 'the address names the selected song');
    // The key tool answers to the selected square only
    await visitor.getByRole('button', { name: 'Herramientas' }).click();
    const visitorBefore = await visitor.locator('.perform__pane .song-sheet .ch').allTextContents();
    await visitor.getByRole('button', { name: 'Subir medio tono' }).click();
    const visitorAfter = await visitor.locator('.perform__pane .song-sheet .ch').allTextContents();
    assert.equal(visitorAfter[0], visitorBefore[0]);
    assert.notEqual(visitorAfter[1], visitorBefore[1]);
    await visitor.keyboard.press('ArrowRight');
    await visitor.locator('.perform__jump', { hasText: '4/4' }).waitFor();
    assert.equal(await visitor.locator('.perform__pane').count(), 1);
    pass('the link carries the union: the visitor sees the same page, side by side, and the key tool answers to the selected square');

    // Separate it again, from the sheet
    await openTools(phone);
    await phone.locator('.sheet-layer.is-open').getByRole('button', { name: /Separar los dos cantos/ }).click();
    await phone.locator('.perform__panes:not(.is-split)').waitFor();
    assert.equal(await squares(phone), 1);
    assert.equal(await positionOf(phone), '3/4');
    await synced(phone);
    await wide.reload();
    await synced(wide);
    await sing(wide, listId, 2);
    assert.equal(await squares(wide), 1, 'and the other device sees it separated');
    pass('"Separar los dos cantos" makes each song a page again, on both devices');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
