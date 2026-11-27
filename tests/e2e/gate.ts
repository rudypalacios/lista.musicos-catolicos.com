/**
 * Browser test of the screens where a person gets in (welcome, sign in, sign up, forgot): one narrow column, centred, with the
 * bar above it, on a phone and on a wide screen. On a wide screen the app lays itself out in a row for its menu at the left;
 * these screens have no menu, so that row must not apply (the bar used to become a column of its own, with the form beside it).
 *
 *     npm run build && node tests/e2e/gate.ts
 */
import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import { chromium, reporter, startServer } from './lib.ts';

const { pass, count } = reporter();
const server = await startServer(18350);
const browser = await chromium.launch();

interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

async function page(width: number, height: number): Promise<Page> {
    const opened = await (await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' })).newPage();
    await opened.goto(server.base + '/');
    await opened.getByRole('button', { name: 'Ya tengo cuenta' }).waitFor();

    return opened;
}

const box = async (page: Page, selector: string): Promise<Box> => {
    const found = await page.locator(selector).first().boundingBox();
    assert.ok(found !== null, `${selector} is on the screen`);

    return found;
};

/** The REM the page uses (16px) times `rem` */
const px = (rem: number): number => rem * 16;

/** What every screen of the gate must satisfy at this width */
async function checkColumn(page: Page, width: number, what: string): Promise<void> {
    const bar = await box(page, '.bar');
    const card = await box(page, '.page--gate .card');
    assert.ok(card.y >= bar.y + bar.height - 1, `${what}: the screen is under the bar, not beside it`);
    assert.ok(card.width <= px(26) + 1, `${what}: the column is at most 26rem wide (${card.width}px)`);
    if (width >= 600) {
        assert.ok(Math.abs(card.x + card.width / 2 - width / 2) <= 2, `${what}: the column is in the middle`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${what}: nothing scrolls sideways`);
}

try {
    for (const [width, height, device] of [[1280, 800, 'a wide screen'], [390, 844, 'a phone']] as const) {
        const wide = await page(width, height);
        await checkColumn(wide, width, `welcome on ${device}`);
        if (width >= 900) {
            const bar = await box(wide, '.bar');
            assert.ok(bar.width >= width - 2, 'the bar spans the whole width on a wide screen');
            const title = await box(wide, '.bar h1');
            assert.ok(Math.abs(title.x + title.width / 2 - width / 2) <= 2, 'its name is in the middle');
        }
        await wide.getByRole('button', { name: 'Ya tengo cuenta' }).click();
        await wide.getByRole('heading', { name: 'Inicia sesión' }).waitFor();
        await checkColumn(wide, width, `sign in on ${device}`);
        const submit = await box(wide, 'button.primary');
        const form = await box(wide, '.page--gate form');
        assert.ok(submit.width >= form.width - px(2.5) - 2, `the main button takes the width of the form on ${device}`);
        await wide.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
        await wide.getByRole('heading', { name: 'Elige una contraseña nueva' }).waitFor();
        await checkColumn(wide, width, `forgot on ${device}`);
        await wide.getByRole('button', { name: 'Volver' }).click();
        await wide.getByRole('button', { name: 'Volver' }).click();
        await wide.getByRole('button', { name: 'Crear cuenta' }).click();
        await wide.getByRole('heading', { name: 'Crea tu cuenta' }).waitFor();
        await checkColumn(wide, width, `sign up on ${device}`);
        pass(`the welcome, sign in, forgot and sign up are one centred column under the bar on ${device}`);
    }

    // Once somebody is in, the app is itself again: the rail at the left on a wide screen
    const inApp = await page(1280, 800);
    await inApp.getByRole('button', { name: 'Probar sin cuenta' }).click();
    await inApp.getByRole('heading', { name: 'Cantos' }).waitFor();
    assert.equal(await inApp.evaluate(() => document.getElementById('app')?.classList.contains('is-gate')), false, 'the gate is gone');
    const rail = await box(inApp, '.menu');
    assert.ok(rail.x <= 1 && rail.height >= 700, 'the menu is a rail at the left, as on every screen of the app');
    pass('inside the app the rail is back (the gate class is only for the screens before it)');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
