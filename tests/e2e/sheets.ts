/**
 * Browser test of the half sheets: on a phone every sheet has its handle on top and it works the same everywhere (pulled down it
 * follows the finger and closes, a short pull comes back); on a wide screen the menus are floating, beside their button, with no
 * handle.
 *
 *     npm run build && node tests/e2e/sheets.ts
 */
import assert from 'node:assert/strict';
import { chromium, newList, openSection, reporter, signIn, startServer } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18260);
const { pass, count } = reporter();
const browser = await chromium.launch();

/** Pulls the handle of the open sheet down by `distance` px, with `steps` moves, and lets go */
async function pull(page: Page, distance: number, steps = 6): Promise<void> {
    // Let it finish sliding in: the handle is measured where it rests
    await page.waitForTimeout(400);
    const box = await page.locator('.sheet-layer.is-open .sheet__grab').boundingBox();
    assert.ok(box, 'the open sheet has a handle');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= steps; step++) {
        await page.mouse.move(x, y + (distance * step) / steps);
    }
    await page.mouse.up();
}

try {
    // ----- a phone -----
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
    await signIn(phone, server.base);
    await openSection(phone, 'Listados');

    // The sheets of the lists screen: the template choice and the "⋯" of a list
    await phone.getByRole('button', { name: 'Nuevo listado' }).click();
    await phone.locator('.sheet-layer.is-open').waitFor();
    await pull(phone, 12);
    await phone.waitForTimeout(400);
    assert.equal(await phone.locator('.sheet-layer.is-open').count(), 1, 'a short pull comes back');
    assert.equal(await phone.locator('.sheet-layer.is-open .sheet').evaluate((el) => (el as HTMLElement).style.transform), '', 'and leaves nothing on the sheet');
    pass('phone: a short pull on the handle puts the sheet back');
    await pull(phone, 260);
    await phone.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
    pass('phone: pulling the handle down closes the sheet (template choice)');

    await newList(phone);
    await phone.locator('section.slot').first().waitFor();
    await phone.getByRole('button', { name: /Más opciones/ }).first().click();
    await phone.locator('.sheet-layer.is-open').waitFor();
    await pull(phone, 260);
    await phone.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
    pass('phone: pulling the handle down closes the sheet inside a list');

    // ----- a wide screen -----
    const wide = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
    await signIn(wide, server.base);
    await openSection(wide, 'Listados');
    const create = wide.getByRole('button', { name: 'Nuevo listado' });
    await create.click();
    await wide.locator('.sheet-layer.is-open').waitFor();
    const button = await create.boundingBox();
    const panel = await wide.locator('.sheet-layer.is-open .sheet').boundingBox();
    assert.ok(button && panel);
    assert.ok(Math.abs(panel.y - (button.y + button.height)) < 40 || panel.y + panel.height < button.y, 'the menu sits next to its button, not at the foot of the screen');
    assert.ok(panel.y + panel.height < 900 - 8, 'it does not touch the bottom edge');
    assert.equal(await wide.locator('.sheet-layer.is-open .sheet__grab').isVisible(), false, 'a floating menu has no handle');
    pass('wide: "Nuevo listado" is a floating menu beside its button');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
