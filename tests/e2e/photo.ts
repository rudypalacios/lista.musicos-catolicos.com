/**
 * Browser test of importing from a photo. The picture is made here, by Chromium, from a page where every chord is put
 * over a syllable we choose, so we know where each chord must land; a second one is the same sheet turned a little, as
 * a photo taken with the hand is. The character reader (Tesseract, WebAssembly, in a worker) is the real one, served as
 * the build leaves it, and the page runs under the production Content-Security-Policy (see enforcePolicy): the reader
 * has to work within it, which is why that policy allows `wasm-unsafe-eval`.
 *
 *     npm run build && node tests/e2e/photo.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syllableStarts } from '../../web/src/pdf/layout.ts';
import { chromium, enforcePolicy, reporter, signIn, startServer } from './lib.ts';

/** A lyric line, and the chords over it as [chord, index of the letter it is over] */
interface Line {
    text: string;
    chords: [string, number][];
}

const TITLE = 'Canto de apertura';
const STANZAS: Line[][] = [
    [
        { text: 'Abrimos la puerta de casa', chords: [['C', 0], ['G', 11]] },
        { text: 'y cantamos juntos, Señor', chords: [['Am', 2], ['F', 11]] },
    ],
    [
        { text: 'Un pueblo que espera el mañana,', chords: [['C', 0], ['Am', 6], ['Dm', 26]] },
        { text: 'y cree que Dios está aquí.', chords: [['G', 2], ['C', 11]] },
    ],
    [
        { text: 'Un pueblo que canta y camina,', chords: [['C', 0], ['Am', 14]] },
        { text: 'sembrando esperanza y amor.', chords: [['G', 3], ['C', 14]] },
    ],
];

/** What the importer must produce: each chord in front of its letter */
function expected(): string {
    const off = STANZAS.flat().flatMap((line) => line.chords.filter(([, index]) => !syllableStarts(line.text).includes(index)).map(([chord]) => `${chord} in "${line.text}"`));
    assert.deepEqual(off, [], 'chords that are not over the start of a syllable');

    return STANZAS.map((stanza) => stanza.map((line) => {
        let text = line.text;
        for (const [chord, index] of [...line.chords].reverse()) {
            text = `${text.slice(0, index)}[${chord}]${text.slice(index)}`;
        }

        return text;
    }).join('\n')).join('\n\n');
}

const server = await startServer(18099);
const { pass, count } = reporter();
const dir = mkdtempSync(join(tmpdir(), 'lista-photo-'));
const browser = await chromium.launch();

try {
    // ----- make the pictures: chords put over the exact letters, straight and turned -----
    const maker = await (await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
    await maker.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await maker.evaluate(({ title, stanzas }: { title: string; stanzas: Line[][] }) => {
        const style = document.createElement('style');
        style.textContent = `
            body { margin: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 26px; color: #111 }
            #sheet { position: relative; width: 1000px; height: 900px; overflow: hidden }
            .lyric, .chord, .title { position: absolute; white-space: pre; line-height: 30px }
            .chord { color: #8a1020; font-weight: bold }
            .title { font-weight: bold; font-size: 38px }
        `;
        document.head.append(style);
        const sheet = document.createElement('section');
        sheet.id = 'sheet';
        document.body.append(sheet);
        const add = (className: string, text: string, left: number, top: number): HTMLDivElement => {
            const element = document.createElement('div');
            element.className = className;
            element.textContent = text;
            element.style.left = `${left}px`;
            element.style.top = `${top}px`;
            sheet.append(element);

            return element;
        };
        add('title', title, 90, 40);
        let top = 140;
        for (const stanza of stanzas) {
            for (const line of stanza) {
                const lyric = add('lyric', line.text, 90, top + 40);
                const node = lyric.firstChild;
                if (node !== null) {
                    for (const [chord, index] of line.chords) {
                        const range = document.createRange();
                        range.setStart(node, index);
                        range.setEnd(node, index + 1);
                        add('chord', chord, range.getBoundingClientRect().left, top);
                    }
                }
                top += 90;
            }
            top += 70;
        }
    }, { title: TITLE, stanzas: STANZAS });
    const straight = join(dir, 'straight.png');
    writeFileSync(straight, await maker.screenshot({ type: 'png' }));
    // The same page, as a photo taken a little crooked, on a grey table, with a shadow
    await maker.addStyleTag({
        content: 'body { background: #cfcfcf } #sheet { transform: rotate(1.6deg); background: linear-gradient(100deg, #fff 0%, #f1f1ee 70%, #e4e4de 100%); box-shadow: 0 0 40px rgba(0,0,0,.35); margin: 24px }',
    });
    const crooked = join(dir, 'crooked.png');
    writeFileSync(crooked, await maker.screenshot({ type: 'png' }));
    const blank = join(dir, 'blank.png');
    await maker.addStyleTag({ content: '.lyric, .chord, .title { display: none }' });
    writeFileSync(blank, await maker.screenshot({ type: 'png' }));
    pass('two pictures of a sheet are made (straight and crooked) with every chord over a chosen syllable, and an empty one');

    // ----- import them, under the production security policy -----
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const violations = await enforcePolicy(context, page);
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    await signIn(page, server.base);
    await page.getByRole('link', { name: 'Importar' }).click();
    // A computer has no camera to open: only the picture and the PDF
    assert.equal(await page.locator('.pick--camera').isVisible(), false, 'no card for the camera on a computer');
    assert.equal(await page.locator('label[for="image-file"]').isVisible(), true);
    pass('importing: a computer shows the cards of the PDF and of a picture, not the camera');

    await page.getByLabel('Cargar imagen').setInputFiles(straight);
    await page.getByRole('heading', { name: 'Revisa el resultado' }).waitFor({ timeout: 120000 });
    const bodyOf = (): Promise<string> => page.locator('.import-card textarea').evaluate((area) => (area as HTMLTextAreaElement).value);
    const body = await bodyOf();
    assert.equal(body, expected());
    pass('importing: every chord of a straight picture lands on the exact syllable it was over');

    const fileCard = page.locator('.file-card');
    await fileCard.getByText('straight.png').waitFor();
    await fileCard.getByText(/KB · Listo/).waitFor();
    await fileCard.getByText('1 canto encontrado').waitFor();
    await fileCard.getByRole('button', { name: 'Cambiar imagen' }).waitFor();
    await page.getByText('Leído de una imagen.').waitFor();
    assert.equal(await page.locator('#paste').inputValue(), '', "the picture's text is not poured into the box");
    pass('importing: the card names the file and says "Listo", and the review warns that it was read from an image');

    const title = await page.locator('.import-card input[id$="-title"]').first().inputValue();
    assert.equal(title, TITLE);
    pass('the first line of the sheet is the title');

    // The same sheet photographed crooked: the page is straightened before the lines are read
    await fileCard.getByRole('button', { name: 'Cambiar imagen' }).waitFor();
    await page.locator('#image-file').setInputFiles(crooked);
    await page.getByText('crooked.png').waitFor();
    await page.getByText(/crooked\.png/).waitFor();
    await fileCard.getByText('1 canto encontrado').waitFor({ timeout: 120000 });
    assert.equal(await bodyOf(), expected());
    pass('importing: the same sheet photographed crooked, with a shadow, gives the same chords');

    // An empty picture: a sentence that says what to try, and the cards come back
    await page.locator('#image-file').setInputFiles(blank);
    await page.locator('#pasteError, .error').filter({ hasText: /No se (encontró|pudo leer)/ }).first().waitFor({ timeout: 120000 });
    await page.locator('label[for="image-file"]').waitFor();
    pass('importing: a picture with nothing to read says so and leaves the cards to try another');

    // On a phone the camera card is there and opens the camera
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' })).newPage();
    await signIn(phone, server.base);
    await phone.getByRole('link', { name: 'Importar' }).click();
    assert.equal(await phone.locator('.pick--camera').isVisible(), true, 'the camera card on a phone');
    assert.equal(await phone.locator('#photo-file').getAttribute('capture'), 'environment');
    pass('importing: a phone shows the card of the camera, which asks for the rear one');

    // The same with the service worker in control, as an installed app has it: the reader is not precached, so its
    // files must pass through the worker to the network
    const installed = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const app = await installed.newPage();
    await signIn(app, server.base);
    await app.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await app.reload();
    assert.equal(await app.evaluate(() => navigator.serviceWorker.controller !== null), true);
    await app.getByRole('link', { name: 'Importar' }).click();
    await app.getByLabel('Cargar imagen').setInputFiles(straight);
    await app.getByRole('heading', { name: 'Revisa el resultado' }).waitFor({ timeout: 120000 });
    pass('importing a picture also works with the service worker in control');

    assert.deepEqual(violations, [], 'the production security policy is respected');
    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    pass('no policy violations and no uncaught errors');

    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
    rmSync(dir, { recursive: true, force: true });
}
