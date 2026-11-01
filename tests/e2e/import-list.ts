/**
 * Browser test of making a list from an import: a file with several songs, "Guardar y crear listado", a template picked,
 * each song in the section its tag names, the list open and the notice that undoes it. The real PHP server and Chromium.
 *
 *     npm run build && node tests/e2e/import-list.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer } from './lib.ts';

const server = await startServer(18103);
const { pass, count } = reporter();
const browser = await chromium.launch();

const MASS = [
    'ENTRADA: Canto de apertura\n\n  C        G\nAbrimos la puerta de casa\n',
    'GLORIA\n\nDm\nGloria a Dios en el cielo\n',
    'SALIDA: Canto de despedida\n\n  G        D\nVamos en paz a servir\n',
];

try {
    const page = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' })).newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, server.base);

    const importText = async (pages: readonly string[], found: RegExp): Promise<void> => {
        await page.goto(`${server.base}/cantos/importar`);
        await page.getByLabel('Pegar el texto con los acordes').fill(pages.join('\f'));
        await page.getByRole('button', { name: 'Convertir' }).click();
        await page.getByRole('heading', { name: found }).waitFor();
    };
    const pickTemplate = async (name: string): Promise<void> => {
        await page.getByRole('button', { name: 'Guardar y crear listado' }).click();
        await page.locator('.sheet-layer.is-open .sheet-action', { hasText: name }).first().click();
    };
    const sectionTitles = (section: string): Promise<string[]> => page.locator('section.slot', { hasText: section }).locator('.item__title').allTextContents();
    const songLinks = async (): Promise<string[]> => {
        await page.goto(`${server.base}/cantos`);
        await page.locator('.song-list').waitFor();

        return page.locator('.song-list .lrow__title').allTextContents();
    };

    // ----- a Mass: each song in the section of its part -----
    await importText(MASS, /Se encontraron 3 cantos/);
    await page.getByRole('button', { name: 'Guardar y crear listado' }).click();
    await page.getByText('Se guardan los 3 cantos y se arma el listado.').waitFor();
    assert.equal(await page.locator('.sheet-layer.is-open .sheet-action', { hasText: 'Administrar plantillas' }).count(), 0, 'it would leave the review');
    await page.locator('.sheet-layer.is-open .sheet-action', { hasText: 'Misa' }).first().click();
    await page.locator('section.slot').first().waitFor();
    assert.deepEqual(await sectionTitles('Canto de entrada'), ['Canto de apertura']);
    assert.deepEqual(await sectionTitles('Gloria'), ['Gloria']);
    assert.deepEqual(await sectionTitles('Canto de salida'), ['Canto de despedida']);
    assert.match(await page.locator('#title').inputValue(), /^Misa del /, 'titled from the template and the day');
    await page.locator('.toast--action').getByText('Listado armado con 3 cantos.').waitFor();
    pass('a Mass: each song is in the section its part names, the list opens, and the notice says how many it has');

    // ----- undo: the list goes, the songs stay -----
    await page.locator('.toast--action').getByRole('button', { name: 'Deshacer' }).click();
    await page.getByRole('heading', { name: 'Listados' }).waitFor();
    assert.equal(await page.locator('.lrow').count(), 0, 'the list is gone');
    assert.deepEqual((await songLinks()).sort(), ['Canto de apertura', 'Canto de despedida', 'Gloria']);
    pass('undoing removes the list and leaves the three songs in Cantos');

    // ----- a blank list takes what the person already has, with their songs, and the new one -----
    await importText([...MASS, 'ENTRADA: Canto nuevo\n\n  Am       F\nUn canto que no tenía\n'], /Se encontraron 4 cantos/);
    assert.equal(await page.locator('.import-card').getByText('Ya la tienes').count(), 3);
    await pickTemplate('En blanco');
    await page.locator('section.slot').first().waitFor();
    assert.deepEqual(await page.locator('.item__title').allTextContents(), ['Canto de apertura', 'Gloria', 'Canto de despedida', 'Canto nuevo'], 'in the order of the file');
    assert.deepEqual((await songLinks()).sort(), ['Canto de apertura', 'Canto de despedida', 'Canto nuevo', 'Gloria'], 'the songs they had were not copied');
    pass('"En blanco": every song goes in, in the order of the file; the ones already held come in as the person\'s own, not as copies');

    // ----- what fits no section stays only in Cantos, and says so -----
    await importText(['ENTRADA: Otro canto de entrada\n\n  C        G\nPasos de entrada\n', 'Un canto sin parte de la misa\n\n  C        G\nLetra de un canto suelto\n'], /Se encontraron 2 cantos/);
    await pickTemplate('Misa');
    await page.locator('section.slot').first().waitFor();
    assert.deepEqual(await page.locator('.item__title').allTextContents(), ['Otro canto de entrada']);
    await page.locator('.toast--action').getByText('Listado armado con 1 canto. 1 no encajó en ninguna sección y quedó solo en Cantos.').waitFor();
    assert.ok((await songLinks()).includes('Un canto sin parte de la misa'), 'the one that did not fit is saved');
    pass('a song that fits no section is saved but not in the list, and the notice says so');

    // ----- nothing fits: nothing is saved and the person is told what to try -----
    await importText(['Primer canto suelto\n\n  C        G\nLetra del primero\n', 'Segundo canto suelto\n\n  Am       F\nLetra del segundo\n'], /Se encontraron 2 cantos/);
    await pickTemplate('Misa');
    await page.getByText(/Ninguno de los cantos encaja en las secciones de «Misa»/).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Guardar 2 cantos' }).isVisible(), true, 'still in the review, nothing saved');
    await pickTemplate('En blanco');
    await page.locator('section.slot').first().waitFor();
    assert.deepEqual(await page.locator('.item__title').allTextContents(), ['Primer canto suelto', 'Segundo canto suelto']);
    pass('with no tags nothing fits a template: it says so and saves nothing; "En blanco" takes them all');

    // ----- the plain Guardar is as it was, and one song has no list option -----
    await importText(['COMUNIÓN: Pan del cielo\n\nDm\nVenid a comer\n'], /Revisa el resultado/);
    assert.equal(await page.getByRole('button', { name: 'Guardar y crear listado' }).isVisible(), false, 'a single song makes no list');
    await page.getByRole('button', { name: 'Guardar canto' }).click();
    await page.getByRole('heading', { name: 'Pan del cielo' }).waitFor();
    pass('Guardar is as before, and one song has no "crear listado"');

    assert.deepEqual(problems, []);
    pass('no uncaught errors');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
