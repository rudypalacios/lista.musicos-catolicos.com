/**
 * Browser test of pull down to sync: with the screen at its top, a drag down and let go syncs now
 * (what another device wrote shows up without waiting for the next automatic sync), and says how
 * it ended. A short drag, a drag on a scrolled screen and a drag while singing do nothing. Two
 * devices on the real PHP server, Chromium with touch.
 *
 *     npm run build && node tests/e2e/pull.ts
 */
import assert from 'node:assert/strict';
import { chromium, openSection, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18097);
const { pass, count } = reporter();
const BASE = server.base;

async function createSong(page: Page, title: string, body: string): Promise<void> {
    await openSection(page, 'Cantos');
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Letra con acordes').fill(body);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

/**
 * A finger on the screen: touches the middle of the top of `#view`, moves `dy` px down in steps
 * and, if `letGo`, lifts. Synthetic touch events: the page listens to them like to a real finger.
 */
async function drag(page: Page, dy: number, letGo = true, from = 40): Promise<void> {
    await page.evaluate(async ({ dy, letGo, from }) => {
        const view = document.querySelector('#view') as HTMLElement;
        const rect = view.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y0 = rect.top + from;
        // What is under the finger, as a real touch targets it
        const under = document.elementFromPoint(x, y0) as HTMLElement | null;
        // (a field keeps its own touches, so a test pulling over one would test nothing)
        const target = (under === null || under.closest('input, textarea, select') !== null ? (view.querySelector('.page, .perform') ?? view) : under) as HTMLElement;
        const touch = (y: number): Touch => new Touch({ identifier: 7, target, clientX: x, clientY: y });
        const fire = (type: string, y: number, ending = false): void => {
            const t = touch(y);
            target.dispatchEvent(new TouchEvent(type, {
                bubbles: true, cancelable: true, touches: ending ? [] : [t], targetTouches: ending ? [] : [t], changedTouches: [t],
            }));
        };
        fire('touchstart', y0);
        for (let step = 1; step <= 10; step++) {
            fire('touchmove', y0 + (dy * step) / 10);
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        }
        if (letGo) {
            fire('touchend', y0 + dy, true);
        }
    }, { dy, letGo, from });
}

const strip = (page: Page) => page.locator('.pull');

const browser = await chromium.launch();
try {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await phone.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, BASE);
    await synced(page);

    const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    const other = await tablet.newPage();
    await signIn(other, BASE);
    await createSong(other, 'Llegó jalando', '[C]Esto lo [G]escribí en la otra tablet');
    await synced(other);

    await openSection(page, 'Cantos');
    assert.equal(await page.getByRole('link', { name: 'Llegó jalando' }).count(), 0, 'the other device has not been heard yet');
    pass('a song written on another device has not arrived by itself yet');

    // ----- a short drag does nothing -----
    await drag(page, 80);
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('link', { name: 'Llegó jalando' }).count(), 0);
    await strip(page).waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#view').evaluate((el) => (el as HTMLElement).style.transform), '', 'the screen is back in place');
    pass('a short drag does not sync, and the screen goes back to its place');

    // ----- a scrolled screen does nothing -----
    await page.evaluate(() => {
        const content = document.querySelector('#view .page') as HTMLElement;
        content.style.minHeight = '3000px';
        (document.querySelector('#view') as HTMLElement).scrollTop = 300;
    });
    await drag(page, 260);
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('link', { name: 'Llegó jalando' }).count(), 0);
    assert.equal(await strip(page).isVisible(), false);
    await page.evaluate(() => {
        (document.querySelector('#view .page') as HTMLElement).style.minHeight = '';
        (document.querySelector('#view') as HTMLElement).scrollTop = 0;
    });
    pass('a drag on a screen that is not at its top scrolls, it does not sync');

    // ----- the real thing -----
    await drag(page, 70, false);
    await strip(page).getByText('Jala para sincronizar').waitFor();
    await page.evaluate(() => {
        (document.querySelector('#view') as HTMLElement).dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, changedTouches: [] }));
    });
    await strip(page).waitFor({ state: 'hidden' });
    pass('while pulling, it says "Jala para sincronizar"; letting the touch be cancelled puts the screen back');

    await drag(page, 220, false);
    await strip(page).getByText('Suelta para sincronizar').waitFor();
    pass('pulled far enough, it says "Suelta para sincronizar"');
    await page.evaluate(() => {
        const view = document.querySelector('#view') as HTMLElement;
        const t = new Touch({ identifier: 7, target: view, clientX: 100, clientY: 300 });
        view.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t] }));
    });
    await strip(page).getByText('Sincronizando…').waitFor();
    await page.getByRole('link', { name: 'Llegó jalando' }).waitFor({ timeout: 10000 });
    await strip(page).getByText('Sincronizado').waitFor();
    pass('letting go syncs now: the song from the other device appears and the strip says "Sincronizado"');
    await strip(page).waitFor({ state: 'hidden', timeout: 5000 });
    assert.equal(await page.locator('#view').evaluate((el) => (el as HTMLElement).style.transform), '');
    pass('the strip goes away by itself and the screen is back in place');

    // ----- no connection -----
    await phone.setOffline(true);
    await drag(page, 220);
    await strip(page).getByText('Sin conexión').waitFor({ timeout: 10000 });
    pass('with no connection it says "Sin conexión" instead of hanging');
    await strip(page).waitFor({ state: 'hidden', timeout: 5000 });
    await phone.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // ----- only from the top of the screen, and not on something that is scrolled inside it -----
    const lines = Array.from({ length: 80 }, (_, i) => `[C]Línea ${i + 1} que [G]se canta`).join('\n');
    await createSong(page, 'Canto de scroll', lines);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        const stage = document.querySelector('#stage') as HTMLElement;
        stage.scrollTop = 400;
    });
    assert.ok(await page.evaluate(() => (document.querySelector('#stage') as HTMLElement).scrollTop) > 0, 'the song scrolls inside its stage');
    // (from the lyrics, whatever the tools above them take)
    const lyricsAt = await page.evaluate(() => (document.querySelector('#stage') as HTMLElement).getBoundingClientRect().top - (document.querySelector('#view') as HTMLElement).getBoundingClientRect().top + 20);
    await drag(page, 260, true, lyricsAt);
    await page.waitForTimeout(500);
    assert.equal(await strip(page).isVisible(), false, 'pulled down while the song is scrolled');
    await page.evaluate(() => { (document.querySelector('#stage') as HTMLElement).scrollTop = 0; });
    await drag(page, 260, true, 600);
    await page.waitForTimeout(500);
    assert.equal(await strip(page).isVisible(), false, 'pulled from the lower part of the screen');
    assert.equal(await page.getByText('Sincronizando…', { exact: true }).count(), 0);
    pass('a drag on a song that is scrolled inside, or from the lower part of the screen, scrolls: it does not sync');
    await drag(page, 70, false, Math.min(lyricsAt, 150));
    await strip(page).getByText('Jala para sincronizar').waitFor();
    await page.evaluate(() => {
        (document.querySelector('#view') as HTMLElement).dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, changedTouches: [] }));
    });
    await strip(page).waitFor({ state: 'hidden' });
    pass('from the top of the song, at its first line, the pull still starts');

    // ----- not while singing -----
    await openSection(page, 'Listados');
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('section.slot').first().waitFor();

    // ----- the screen, pulled down, never paints over the menu -----
    await page.waitForTimeout(3200);
    await drag(page, 120, false);
    const covered = await page.evaluate(() => {
        const menu = document.querySelector('.menu')!.getBoundingClientRect();
        const hit = document.elementFromPoint(menu.left + menu.width / 2, menu.top + menu.height / 2);

        return hit?.closest('.menu') === null;
    });
    await page.evaluate(() => {
        const target = document.querySelector('#view .page') as HTMLElement;
        const touch = new Touch({ identifier: 7, target, clientX: 100, clientY: 300 });
        target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch] }));
    });
    assert.equal(covered, false, 'the list pulled down paints over the menu');
    pass('pulling the screen down to sync leaves the menu uncovered');
    await strip(page).waitFor({ state: 'hidden', timeout: 10000 });

    await page.getByRole('link', { name: 'Agregar canto a Canto de entrada' }).click();
    await page.getByLabel('Buscar cantos').fill('jalando');
    await page.locator('button.lrow__pick', { hasText: 'Llegó jalando' }).click();
    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.locator('.perform').waitFor();
    await drag(page, 260);
    await page.waitForTimeout(500);
    assert.equal(await strip(page).isVisible(), false, 'no strip while singing');
    assert.equal(await page.getByText('Sincronizando…', { exact: true }).count(), 0);
    pass('while singing a pull does nothing: the stage keeps its own touches');

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
