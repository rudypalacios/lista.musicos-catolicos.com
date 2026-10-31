/**
 * Browser test of holding a song to move it, with a real touch (the Chrome DevTools protocol sends the finger, so the
 * pointer events are the ones a phone makes): the press lifts the row, moving the finger shows where it lands, letting
 * go drops it there; the drag is not taken for a pull to sync and the drop does not sing the song; a short touch still
 * sings it, and a touch that moves before the press is long scrolls. The real PHP server, Chromium with touch.
 *
 *     npm run build && node tests/e2e/drag.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer, synced } from './lib.ts';

const server = await startServer(18098);
const { pass, count } = reporter();

const browser = await chromium.launch();
try {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
    const page = await phone.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, server.base);
    await synced(page);

    // A list of one section with four songs, as the server would hold it
    const listId = await page.evaluate(async () => {
        const id = (): string => crypto.randomUUID();
        const now = Date.now();
        const songs = ['Uno', 'Dos', 'Tres', 'Cuatro'].map((title) => ({ id: id(), title, author: '', body: '[C]a', tags: [], updatedAt: now, deleted: false }));
        const list = {
            id: id(), title: 'Prueba táctil', eventDate: null, notes: '', updatedAt: now, deleted: false,
            parts: [{ id: 'comunion', name: 'Canto de comunión' }],
            items: songs.map((song) => ({ id: id(), part: 'comunion', songId: song.id, transpose: 0, note: '' })),
        };
        const answer = await fetch('/api/sync', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ songs, setlists: [list] }),
        });
        if (!answer.ok) {
            throw new Error(await answer.text());
        }

        return list.id;
    });
    await page.reload();
    await synced(page);
    await page.goto(`${server.base}/listados/${listId}`);
    await page.locator('section.slot').first().waitFor();
    const cdp = await phone.newCDPSession(page);
    const order = (): Promise<string[]> => page.locator('.item__title').allTextContents();
    const rows = page.locator('.item__open');
    const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number): Promise<unknown> =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    assert.deepEqual(await order(), ['Uno', 'Dos', 'Tres', 'Cuatro']);

    // Hold the first song, carry it past the last, let go
    const top = (await rows.nth(0).boundingBox())!;
    const bottom = (await rows.nth(3).boundingBox())!;
    const x = top.x + top.width / 2;
    const from = top.y + top.height / 2;
    await finger('touchStart', x, from);
    await page.locator('.item.is-lifted').waitFor();
    assert.equal(await page.locator('.items.is-dragging').count(), 1);
    const to = bottom.y + bottom.height * 1.3;
    for (let step = 1; step <= 10; step++) {
        await finger('touchMove', x, from + ((to - from) * step) / 10);
        await page.waitForTimeout(30);
    }
    await page.locator('.drag-line').waitFor();
    assert.equal(await page.locator('.pull:not([hidden])').count(), 0, 'carrying a song is not a pull to sync');
    await finger('touchEnd', x, to);
    await page.waitForFunction(() => document.querySelector('.item:last-child .item__title')?.textContent === 'Uno');
    assert.deepEqual(await order(), ['Dos', 'Tres', 'Cuatro', 'Uno']);
    assert.ok(!page.url().includes('/cantar/'), 'dropping a song does not sing it');
    assert.equal(await page.locator('.item.is-lifted, .drag-line, .pull:not([hidden])').count(), 0, 'nothing is left floating');
    pass('a long press lifts the song, the finger carries it and a line shows where it lands; letting go drops it there (no pull to sync, no singing)');

    // What the server holds is the new order (it is sent a moment after the drop)
    const held = async (): Promise<(string | undefined)[] | undefined> => page.evaluate(async () => {
        const answer = (await (await fetch('/api/sync?since=0')).json()) as {
            songs: { id: string; title: string }[]; setlists: { items: { songId: string }[]; deletedAt: number | null }[];
        };
        const names = new Map(answer.songs.map((song) => [song.id, song.title]));

        return answer.setlists.find((list) => list.deletedAt === null)?.items.map((item) => names.get(item.songId));
    });
    for (let attempt = 0; attempt < 100 && (await held())?.[0] !== 'Dos'; attempt++) {
        await page.waitForTimeout(150);
    }
    assert.deepEqual(await held(), ['Dos', 'Tres', 'Cuatro', 'Uno']);
    pass('the new order is what the server holds');

    // A touch that moves before the press is long is a scroll: nothing lifts or moves
    const again = (await rows.nth(0).boundingBox())!;
    await finger('touchStart', again.x + 60, again.y + again.height / 2);
    await finger('touchMove', again.x + 60, again.y + again.height / 2 + 40);
    await page.waitForTimeout(650);
    assert.equal(await page.locator('.item.is-lifted').count(), 0, 'a touch that moved first is not a drag');
    await finger('touchEnd', again.x + 60, again.y + again.height / 2 + 40);
    assert.deepEqual(await order(), ['Dos', 'Tres', 'Cuatro', 'Uno']);
    pass('a touch that moves before the press is long does not lift anything');

    // A short touch still sings the song
    await rows.nth(1).tap();
    await page.waitForURL((url) => /\/cantar\/\d+$/.test(url.pathname));
    pass('a short touch still sings the song');

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
