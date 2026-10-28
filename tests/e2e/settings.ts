/**
 * Browser test of phase 5: the settings screen (chord names, lyric colour, columns) and the two
 * ways of singing a list. Rehearsal shows every tool and takes notes; event keeps a slim bar
 * with the quick tools and gives way to the lyrics when they are scrolled.
 *
 *     npm run build && node tests/e2e/settings.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18094);
const { pass, count } = reporter();

const SHORT = '[C]Abrimos la [G]puerta de casa\n[F]Entra, her[G]mano, ven';
const LONG = Array.from({ length: 14 }, (_, n) =>
    `{c: Verso ${n + 1}}\n[C]Caminamos juntos [G]por la senda del [Am]día\n[F]y la luz nos [G]guía hasta el [C]fin\n[C]Caminamos juntos [G]por la senda del [Am]día\n[F]y la luz nos [G]guía hasta el [C]fin`).join('\n\n');

async function createSong(page: Page, title: string, body: string): Promise<void> {
    await page.getByRole('link', { name: 'Cantos', exact: true }).click();
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Letra con acordes').fill(body);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: title }).waitFor();
}

async function openSong(page: Page, title: string): Promise<void> {
    await page.getByRole('link', { name: 'Cantos', exact: true }).click();
    await page.getByRole('link', { name: title }).click();
    await page.locator('#song-sheet .ch').first().waitFor();
}

async function setting(page: Page, label: string): Promise<void> {
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await page.getByRole('heading', { name: 'Ajustes' }).waitFor();
    await page.getByLabel(label).check();
}

/** The fit runs on the frame after the song is drawn: look only once it has */
async function settled(page: Page): Promise<void> {
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await page.waitForTimeout(100);
}

const has = (page: Page, selector: string): Promise<boolean> => page.evaluate((s) => document.querySelector(s) !== null, selector);

const browser = await chromium.launch();
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, server.base);
    await createSong(page, 'Puerta corta', SHORT);
    await createSong(page, 'Camino largo', LONG);

    // ----- chord names -----
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await page.getByRole('heading', { name: 'Ajustes' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Cantos', exact: true }).getAttribute('aria-current'), null);
    assert.equal((await page.locator('.settings__sample .ch').first().textContent()), 'Do');
    await page.getByLabel('C, D, E').check();
    assert.equal((await page.locator('.settings__sample .ch').first().textContent()), 'C');
    await page.locator('.toast', { hasText: 'Ajuste guardado' }).waitFor();
    await openSong(page, 'Puerta corta');
    assert.equal(await page.locator('#song-sheet .ch').first().textContent(), 'C');
    pass('the chord names are a setting, shown in an example and used by the songs');
    await setting(page, 'Do, Re, Mi');

    // ----- lyric colour -----
    await page.getByLabel('Ámbar').check();
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--lyric-color')), '#ffd479');
    await openSong(page, 'Puerta corta');
    assert.equal(await page.locator('#song-sheet .lyr').first().evaluate((el) => getComputedStyle(el).color), 'rgb(255, 212, 121)');
    await page.reload();
    await page.locator('#song-sheet .ch').first().waitFor();
    assert.equal(await page.locator('#song-sheet .lyr').first().evaluate((el) => getComputedStyle(el).color), 'rgb(255, 212, 121)');
    pass('the lyric colour applies to the lyrics, not the chords, and survives a reload');
    await setting(page, 'Predeterminado');
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--lyric-color')), '');

    // ----- columns on a wide screen -----
    await openSong(page, 'Puerta corta');
    await settled(page);
    assert.equal(await has(page, '.viewer-content.is-columns'), false, 'a short song stays in one column on auto');
    await setting(page, 'Siempre dos');
    await openSong(page, 'Puerta corta');
    await settled(page);
    assert.equal(await has(page, '.viewer-content.is-columns'), true, 'two columns even for a short song');
    await setting(page, 'Siempre una');
    await openSong(page, 'Camino largo');
    await settled(page);
    assert.equal(await has(page, '.viewer-content.is-columns'), false, 'one column even for a long song');
    await settled(page);
    assert.equal(await has(page, '.viewer-content.is-scroll'), true, 'and it scrolls instead');
    pass('the columns setting forces one or two columns on a wide screen');

    // The quick button in the reader cycles auto → 2 → 1 and is remembered
    await setting(page, 'Automático (las que necesite el canto)');
    await openSong(page, 'Puerta corta');
    await page.getByRole('button', { name: /Columnas: auto/ }).click();
    await page.getByRole('button', { name: /Columnas: 2/ }).waitFor();
    await settled(page);
    assert.equal(await has(page, '.viewer-content.is-columns'), true);
    await page.getByRole('button', { name: /Columnas: 2/ }).click();
    await page.getByRole('button', { name: /Columnas: 1/ }).waitFor();
    await settled(page);
    assert.equal(await has(page, '.viewer-content.is-columns'), false);
    await page.getByRole('button', { name: /Columnas: 1/ }).click();
    await page.getByRole('button', { name: /Columnas: auto/ }).waitFor();
    pass('the reader has a columns button (auto → 2 → 1) on a wide screen');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Columnas:/ }).waitFor({ state: 'hidden' });
    pass('and not on a phone, where two columns do not fit');
    await page.setViewportSize({ width: 1280, height: 800 });

    // ----- the list to sing -----
    await page.getByRole('link', { name: 'Listados', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo listado' }).click();
    await page.locator('section.slot').first().waitFor();
    for (const [part, song] of [['Canto de entrada', 'Camino largo'], ['Canto de salida', 'Puerta corta']] as const) {
        await page.getByRole('link', { name: `Agregar canto a ${part}` }).click();
        await page.getByLabel('Buscar cantos').fill(song);
        await page.getByRole('button', { name: new RegExp(song) }).click();
        await page.getByRole('link', { name: '← Listados' }).waitFor();
    }
    await synced(page);

    // ----- event mode: the default, one row of bar and everything else behind "⋯" -----
    await setting(page, 'Modo evento: para cantar (las notas solo se leen)');
    await page.getByRole('link', { name: 'Listados', exact: true }).click();
    await page.locator('.song-list .song-item').first().click();
    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.getByRole('heading', { name: 'Camino largo' }).waitFor();
    await page.getByRole('button', { name: 'Más herramientas' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Ajustar' }).isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Tono y tamaño rápidos' }).isVisible(), true);
    assert.ok((await page.locator('.perform__chrome').boundingBox())!.height < 60, 'the bar is one row');
    await page.getByRole('button', { name: 'Más herramientas' }).click();
    assert.equal(await page.getByRole('button', { name: 'Ajustar' }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Subir un semitono' }).isVisible(), true);
    assert.equal(await page.getByRole('link', { name: 'Ajustes' }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Salir' }).isVisible(), true);
    assert.match(await page.locator('.perform__sync').innerText(), /Sincronizado|Sincronizando/);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ajustar' }).waitFor({ state: 'hidden' });
    pass('singing has a one-row bar; the tools, the account and the mode are behind "⋯", and Escape closes it');

    // The pill keeps the key and the size one tap away, collapsed until tapped
    assert.equal(await page.getByRole('button', { name: 'Subir el tono' }).isVisible(), false);
    await page.getByRole('button', { name: 'Tono y tamaño rápidos' }).click();
    await page.getByRole('button', { name: 'Subir el tono' }).click();
    await page.locator('.perform__pill-key', { hasText: 'Do#' }).waitFor();
    await page.getByRole('button', { name: 'Bajar el tono' }).click();
    await page.locator('.perform__pill-key', { hasText: /^Do$/ }).waitFor();
    pass('the pill changes the key from the lyrics, and shows it');

    // Emergency: the lyrics can be made bigger even with the fit on (and then they scroll)
    const sizeOf = (): Promise<number> =>
        page.locator('.viewer-content').evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--lyric-size')));
    const fitted = await sizeOf();
    await page.getByRole('button', { name: 'Agrandar la letra' }).click();
    assert.equal(await sizeOf(), fitted + 2);
    await page.getByRole('button', { name: 'Achicar la letra' }).click();
    await page.getByRole('button', { name: 'Achicar la letra' }).click();
    assert.equal(await sizeOf(), fitted - 2);
    await page.getByRole('button', { name: 'Agrandar la letra' }).click();
    assert.equal(await sizeOf(), fitted);
    pass('A− and A+ work with the fit on: they nudge the size the fit chose');

    // The bar folds to a strip when the lyrics are scrolled down and comes back on scrolling up or on a tap
    await page.setViewportSize({ width: 390, height: 700 });
    await page.getByRole('button', { name: 'Agrandar la letra' }).click();
    await page.waitForFunction(() => {
        const stage = document.querySelector('#stage');

        return stage !== null && stage.scrollHeight > stage.clientHeight + 200;
    });
    const scrollStage = (top: number): Promise<void> =>
        page.evaluate((to) => {
            (document.querySelector('#stage') as HTMLElement).scrollTop = to;
        }, top);
    const stageHeight = (): Promise<number> => page.locator('#stage').evaluate((el) => el.getBoundingClientRect().height);
    const unfolded = await stageHeight();
    await scrollStage(300);
    await page.waitForFunction(() => document.querySelector('.perform__chrome.is-folded') !== null);
    assert.equal(await page.getByRole('button', { name: 'Mostrar la barra' }).isVisible(), true);
    assert.equal(await page.locator('.perform__strip').innerText().then((text) => text.includes('Camino largo')), true, 'the strip keeps the title');
    assert.equal(await page.locator('.perform__pill.is-away').count(), 1, 'the pill goes with the bar');
    assert.equal(await stageHeight(), unfolded, 'folding the bar does not resize the lyrics');
    await page.getByRole('button', { name: 'Mostrar la barra' }).click();
    assert.equal(await has(page, '.perform__chrome.is-folded'), false);
    await scrollStage(600);
    await page.waitForFunction(() => document.querySelector('.perform__chrome.is-folded') !== null);
    await scrollStage(200);
    await page.waitForFunction(() => document.querySelector('.perform__chrome.is-folded') === null);
    await page.getByRole('button', { name: 'Tono y tamaño rápidos' }).waitFor();
    pass('the bar folds to a strip with the title when the lyrics scroll down, and comes back on scroll up or a tap');

    // ----- rehearsal mode: notes can be written -----
    await page.setViewportSize({ width: 1280, height: 800 });
    await scrollStage(0);
    await page.getByRole('button', { name: 'Más herramientas' }).click();
    assert.equal(await page.getByRole('button', { name: /Evento/ }).getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.perform__modes').innerText(), /para preparar[\s\S]*para cantar/i);
    assert.equal(await page.getByLabel('Nota de este canto').count(), 0);
    await page.getByRole('button', { name: /Ensayo/ }).click();
    await page.locator('.perform__notefield').waitFor({ state: 'attached' });
    await page.getByRole('button', { name: 'Más herramientas' }).click();
    await page.locator('.perform__mode[aria-pressed="true"]', { hasText: 'Ensayo' }).waitFor();
    await page.getByLabel('Nota de este canto').fill('Tono alto, bajar medio tono');
    await page.getByLabel('Nota de este canto').blur();
    await page.locator('.toast', { hasText: 'Guardado' }).waitFor();
    await synced(page);
    pass('rehearsal mode takes a note on the song being sung');

    // The note is read, not edited, in event mode, and the list has it
    await page.getByRole('button', { name: /Evento/ }).click();
    await page.locator('.perform__notefield').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Más herramientas' }).click();
    assert.equal(await page.getByLabel('Nota de este canto').count(), 0);
    await page.getByText('Tono alto, bajar medio tono').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.sheet-layer.is-open').waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'Volver al listado' }).click();
    await page.getByRole('button', { name: 'Editar la nota de Camino largo' }).waitFor();
    pass('in event mode the note is only read; the list shows what was written while rehearsing');

    // The mode is a setting of the device: it is still event after a reload
    await page.getByRole('link', { name: 'Cantar' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Más herramientas' }).waitFor();
    pass('the mode is remembered on the device');

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
