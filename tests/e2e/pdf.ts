/**
 * Browser test of importing straight from a PDF. The PDF is made here, by Chromium, from a page
 * where every chord is put over a syllable we choose, so we know exactly where each chord must land.
 * It is a real PDF with a text layer, in a proportional font, with hanging verse numbers, three
 * pages and a page in two columns: the shape of a sheet exported from Word or Docs.
 *
 * The page runs under the production Content-Security-Policy (see enforcePolicy): the PDF reader
 * and its worker must work within it.
 *
 *     npm run build && node tests/e2e/pdf.ts
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
/** A stanza: its lines, and a hanging verse number (or none) */
interface Stanza {
    number?: number;
    lines: Line[];
}
interface Sheet {
    header: string;
    columns: Stanza[][];
}

const SHEETS: Sheet[] = [
    {
        header: 'ENTRADA: Canto de apertura',
        columns: [[
            { lines: [
                { text: 'Abrimos la puerta de casa', chords: [['C', 0], ['G', 11]] },
                { text: 'y cantamos juntos, Señor', chords: [['Am', 2], ['F', 11]] },
            ] },
            { number: 1, lines: [
                { text: 'Un pueblo que espera el mañana,', chords: [['C', 0], ['Am', 6], ['Dm', 26]] },
                { text: 'y sabe que Dios está aquí.', chords: [['G', 2], ['C', 11]] },
            ] },
            { number: 2, lines: [
                { text: 'Un pueblo que canta y camina,', chords: [['C', 0], ['Am', 14]] },
                { text: 'sembrando esperanza y amor.', chords: [['G', 3], ['C', 14]] },
            ] },
        ]],
    },
    {
        header: 'GLORIA',
        columns: [[
            { lines: [
                { text: 'Gloria a Dios en el cielo', chords: [['Dm', 0], ['C', 14]] },
                { text: 'y en la tierra paz a los hombres', chords: [['Bb', 2], ['A7', 11]] },
            ] },
        ]],
    },
    {
        header: 'SALIDA: Canto de despedida',
        columns: [
            [
                { number: 1, lines: [
                    { text: 'Vamos en paz a servir', chords: [['G', 0], ['D', 9]] },
                    { text: 'con la luz del Señor', chords: [['Em', 4], ['C', 15]] },
                ] },
                { number: 2, lines: [
                    { text: 'Llevamos la alegría', chords: [['G', 0], ['D', 9]] },
                    { text: 'a todos los hermanos', chords: [['Em', 2], ['C', 12]] },
                ] },
                { number: 3, lines: [
                    { text: 'Caminamos por la tierra', chords: [['G', 0], ['D', 10]] },
                    { text: 'sembrando la esperanza', chords: [['Em', 3], ['C', 13]] },
                ] },
            ],
            [
                { number: 4, lines: [
                    { text: 'Volvemos a nuestra casa', chords: [['G', 0], ['D', 9]] },
                    { text: 'con el pan de la mesa', chords: [['Em', 4], ['C', 14]] },
                ] },
                { number: 5, lines: [
                    { text: 'Gracias por esta jornada', chords: [['G', 0], ['D', 8]] },
                    { text: 'hasta la próxima misa', chords: [['Em', 6], ['C', 12]] },
                ] },
                { number: 6, lines: [
                    { text: 'Nos vamos con tu bendición', chords: [['G', 0], ['D', 6]] },
                    { text: 'y con la paz de tu amor', chords: [['Em', 2], ['C', 9]] },
                ] },
            ],
        ],
    },
];

/** What the importer must produce for a sheet: each chord in front of its letter, verses labelled */
function expected(sheet: Sheet): string {
    // A chord goes over the start of a syllable: that is where the importer puts it, wherever it sits in it
    const off = sheet.columns
        .flat()
        .flatMap((stanza) => stanza.lines)
        .flatMap((line) => line.chords.filter(([, index]) => !syllableStarts(line.text).includes(index)).map(([chord]) => `${chord} in "${line.text}"`));
    assert.deepEqual(off, [], 'chords that are not over the start of a syllable');
    const body: string[] = [];
    for (const column of sheet.columns) {
        for (const stanza of column) {
            if (body.length > 0) {
                body.push('');
            }
            if (stanza.number !== undefined) {
                body.push(`{c: Verso ${stanza.number}}`);
            }
            for (const line of stanza.lines) {
                let text = line.text;
                for (const [chord, index] of [...line.chords].reverse()) {
                    text = `${text.slice(0, index)}[${chord}]${text.slice(index)}`;
                }
                body.push(text);
            }
        }
    }

    return body.join('\n');
}

const server = await startServer(18083);
const { pass, count } = reporter();
const dir = mkdtempSync(join(tmpdir(), 'lista-pdf-'));
const browser = await chromium.launch();

try {
    // ----- make the PDF: chords put over the exact letters -----
    const maker = await (await browser.newContext({ viewport: { width: 816, height: 1056 } })).newPage();
    await maker.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await maker.evaluate((sheets: Sheet[]) => {
        const style = document.createElement('style');
        style.textContent = `
            @page { size: Letter; margin: 0 }
            body { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 20px }
            .page { position: relative; width: 816px; height: 1056px; page-break-after: always; overflow: hidden }
            .lyric, .chord, .number, .header { position: absolute; white-space: pre; line-height: 24px }
            .chord { color: #c00000; font-weight: bold }
            .header { font-weight: bold }
        `;
        document.head.append(style);
        for (const sheet of sheets) {
            const page = document.createElement('section');
            page.className = 'page';
            document.body.append(page);
            const add = (className: string, text: string, left: number, top: number): HTMLDivElement => {
                const el = document.createElement('div');
                el.className = className;
                el.textContent = text;
                el.style.left = `${left}px`;
                el.style.top = `${top}px`;
                page.append(el);

                return el;
            };
            add('header', sheet.header, 72, 60);
            sheet.columns.forEach((column, columnIndex) => {
                const left = columnIndex === 0 ? 96 : 456;
                let top = 130;
                for (const stanza of column) {
                    for (const [lineIndex, line] of stanza.lines.entries()) {
                        const lyric = add('lyric', line.text, left, top + 28);
                        if (stanza.number !== undefined && lineIndex === 0) {
                            add('number', `${stanza.number}.`, left - 28, top + 28);
                        }
                        const node = lyric.firstChild;
                        if (node === null) {
                            continue;
                        }
                        for (const [chord, index] of line.chords) {
                            const range = document.createRange();
                            range.setStart(node, index);
                            range.setEnd(node, index + 1);
                            add('chord', chord, range.getBoundingClientRect().left, top);
                        }
                        top += 56;
                    }
                    top += 28;
                }
            });
        }
    }, SHEETS);
    const pdfPath = join(dir, 'misa.pdf');
    writeFileSync(pdfPath, await maker.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true }));
    pass('a three-page PDF is made with every chord over a chosen syllable');

    // ----- import it, under the production security policy -----
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const violations = await enforcePolicy(context, page);
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    await signIn(page, server.base);
    await page.getByRole('link', { name: 'Importar' }).click();
    await page.getByLabel('Subir un PDF').setInputFiles(pdfPath);
    await page.getByRole('heading', { name: /Se encontraron 3 cantos/ }).waitFor();
    assert.equal(await page.locator('.import-card').count(), 3);
    pass('importing: a PDF with a song per page becomes three songs');

    const titles = await page.locator('.import-card input[id$="-title"]').evaluate(() => 0).catch(() => 0);
    assert.equal(titles, 0);
    const bodies = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLTextAreaElement>('.import-card textarea')).map((area) => area.value),
    );
    assert.equal(bodies.length, 3);
    for (const [index, sheet] of SHEETS.entries()) {
        assert.equal(bodies[index], expected(sheet), `page ${index + 1}`);
    }
    pass('every chord of every page lands on the exact syllable it was over');

    const names = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLInputElement>('.import-card input[type="text"]'))
            .filter((input) => input.id.endsWith('-title'))
            .map((input) => input.value),
    );
    assert.deepEqual(names, ['Canto de apertura', 'Gloria', 'Canto de despedida']);
    pass('the headers give the titles, and the two-column page is read left column then right');

    await page.getByRole('button', { name: 'Guardar 3 cantos' }).click();
    await page.locator('.song-list').waitFor();
    await page.getByRole('link', { name: 'Canto de despedida' }).click();
    await page.getByRole('heading', { name: 'Canto de despedida' }).waitFor();
    assert.deepEqual(await page.locator('#song-sheet .ch').first().textContent(), 'Sol');
    pass('the imported songs open in the viewer');

    // The same with the service worker in control, as an installed app has it: the reader is not
    // precached, so its chunk and its worker must pass through the worker to the network
    const installed = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const app = await installed.newPage();
    await signIn(app, server.base);
    await app.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await app.reload();
    assert.equal(await app.evaluate(() => navigator.serviceWorker.controller !== null), true);
    await app.getByRole('link', { name: 'Importar' }).click();
    await app.getByLabel('Subir un PDF').setInputFiles(pdfPath);
    await app.getByRole('heading', { name: /Se encontraron 3 cantos/ }).waitFor();
    pass('importing a PDF also works with the service worker in control');

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
