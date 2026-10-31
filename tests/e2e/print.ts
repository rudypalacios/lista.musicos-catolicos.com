/**
 * Browser test of phase 3: printing. Songs of every length and a setlist go through the real
 * "Imprimir" menu and Chromium's own PDF printer (window.print() itself is a dialog, so it is
 * stubbed and the page is printed with page.pdf()). Checks that:
 *  - every song starts on its own page, in the order of the Mass, in the key of the list;
 *  - the layout PrintLayout chooses really fits: normal, compact and columns print on ONE page
 *    (the cascade's whole point), and only "pages" may run over, and no line is ever cut off;
 *  - the page carries the print fonts under the production policy, also with no connection.
 *
 *     npm run build && node tests/e2e/print.ts
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, enforcePolicy, reporter, signIn, startServer, synced } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18088);
const { pass, count } = reporter();

const CHORDS_LINE = '[G]Cuánto he espe[D]rado este mo[Em]mento';
const PLAIN_LINE = 'Cuánto he esperado este momento';

/** Stanzas of four lines; `chords` or lyrics only */
function song(stanzas: number, chords: boolean): string {
    const line = chords ? CHORDS_LINE : PLAIN_LINE;

    return Array(stanzas).fill(Array(4).fill(line).join('\n')).join('\n\n');
}

interface Sample {
    title: string;
    body: string;
}

/** From a few lines to many pages, so the four layouts all come up */
const SAMPLES: Sample[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 24].flatMap((n) => [
    { title: `Con acordes ${String(n).padStart(2, '0')}`, body: song(n, true) },
    { title: `Solo letra ${String(n).padStart(2, '0')}`, body: song(n, false) },
]);

/** A song shaped like a real one, to read the printed text of */
const REAL: Sample = {
    title: 'Pan de vida',
    body: '{key: C}\n{capo: 2}\n{tempo: 72}\n{c: Coro}\n[C]Pan de vida para el [G]camino\n[F]Danos hoy tu [C]paz\n\n{c: Verso 1}\n[Am]Venimos a tu [E]mesa',
};

async function pdfPages(buffer: Uint8Array): Promise<string[][]> {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    const pages: string[][] = [];
    for (let number = 1; number <= document.numPages; number++) {
        const content = await (await document.getPage(number)).getTextContent();
        pages.push(content.items.map((item) => ('str' in item ? item.str : '')).filter((text) => text.trim() !== ''));
    }

    return pages;
}

/** Prints what #print-root holds, as the browser would put it on Letter paper */
async function toPdf(page: Page): Promise<string[][]> {
    return pdfPages(await page.pdf({ format: 'Letter', preferCSSPageSize: true, printBackground: false }));
}

/** Opens the menu, picks a sheet and waits until the page asked the browser to print */
async function choosePrint(page: Page, sheet: 'Con acordes' | 'Solo letra'): Promise<void> {
    const before = await page.evaluate(() => (window as unknown as { printed: number }).printed);
    await page.locator('.print-menu summary').click();
    await page.getByRole('button', { name: sheet, exact: true }).click();
    await waitForPrint(page, before);
}

/** A setlist prints from the sheet behind its "⋯": the same two sheets, as options of that sheet */
async function choosePrintFromList(page: Page, sheet: 'Con acordes' | 'Solo letra'): Promise<void> {
    const before = await page.evaluate(() => (window as unknown as { printed: number }).printed);
    await page.getByRole('button', { name: 'Más opciones del listado' }).click();
    await page.getByRole('button', { name: sheet === 'Con acordes' ? 'Imprimir con acordes' : 'Imprimir solo la letra' }).click();
    await waitForPrint(page, before);
}

async function waitForPrint(page: Page, before: number): Promise<void> {
    // The page runs under the production policy: no strings evaluated, so the mark goes in first
    await page.evaluate((n) => {
        (window as unknown as { printedBefore: number }).printedBefore = n;
    }, before);
    await page.waitForFunction(() => {
        const marks = window as unknown as { printed: number; printedBefore: number };
        return marks.printed > marks.printedBefore;
    });
}

async function seed(page: Page, samples: Sample[]): Promise<{ ids: string[]; setlist: string }> {
    return page.evaluate(async (all) => {
        const now = Date.now();
        const songs = all.map((sample) => ({
            id: crypto.randomUUID(), title: sample.title, author: 'Autor', body: sample.body, updatedAt: now, deleted: false,
        }));
        const setlist = {
            id: crypto.randomUUID(), title: 'Misa de prueba', eventDate: null, notes: '', updatedAt: now, deleted: false,
            items: [
                { part: 'ofertorio', index: 2, transpose: 2 },
                { part: 'entrada', index: 0, transpose: 0 },
                { part: 'comunion', index: 1, transpose: 0 },
            ].map((place) => ({
                id: crypto.randomUUID(), part: place.part, songId: songs[place.index % songs.length]?.id ?? '', transpose: place.transpose, note: '',
            })),
        };
        const answer = await fetch('/api/sync', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ songs, setlists: [setlist] }),
        });
        if (!answer.ok) {
            throw new Error(`seed failed: ${answer.status} ${await answer.text()}`);
        }

        return { ids: songs.map((s) => s.id), setlist: setlist.id };
    }, samples);
}

const browser = await chromium.launch();
try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' });
    // window.print() opens a dialog: count the calls instead, and print the page ourselves
    await context.addInitScript(() => {
        (window as unknown as { printed: number }).printed = 0;
        window.print = () => {
            (window as unknown as { printed: number }).printed++;
        };
    });
    const page = await context.newPage();
    const violations = await enforcePolicy(context, page);
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));

    await signIn(page, server.base);
    const real = await seed(page, [REAL]);
    const sheetCases = await seed(page, SAMPLES);
    await page.reload();
    await synced(page);

    // ----- a song: menu, header, key, notation -----
    await page.goto(`${server.base}/cantos/${real.ids[0]}?t=2`);
    await page.locator('#song-sheet .ch').first().waitFor();
    await choosePrint(page, 'Con acordes');
    let pages = await toPdf(page);
    assert.equal(pages.length, 1);
    const text = (pages[0] ?? []).join(' ');
    assert.match(text, /Pan de vida/);
    assert.match(text, /Autor/);
    assert.match(text, /Tono/);
    assert.match(text, /\bRe\b/, 'the key on screen (C +2 = Re) is the one that prints');
    assert.match(text, /72 BPM/);
    assert.doesNotMatch(text, /Cuánto/);
    pass('a song prints on one page with its header, musical data and the key on screen');

    await choosePrint(page, 'Solo letra');
    pages = await toPdf(page);
    const lyricsOnly = (pages[0] ?? []).join(' ');
    assert.match(lyricsOnly, /Pan de vida/);
    assert.doesNotMatch(lyricsOnly, /Tono|BPM/);
    assert.doesNotMatch(lyricsOnly, /\bRe\b/, 'no chords on the sheet to hand out');
    pass('the lyrics-only sheet leaves out chords and musical data');

    // The colour of the lyrics is a setting for the screen: paper is always black on white, whatever it is set to
    await page.evaluate(() => document.documentElement.style.setProperty('--lyric-color', '#ffffff'));
    await page.emulateMedia({ media: 'print' });
    const inks = await page.evaluate(() => [...document.querySelectorAll('#print-root .song-sheet .lyr')].map((node) => getComputedStyle(node).color));
    await page.emulateMedia({ media: null });
    await page.evaluate(() => document.documentElement.style.removeProperty('--lyric-color'));
    assert.ok(inks.length > 0, 'there are lyrics on the sheet');
    assert.deepEqual([...new Set(inks)], ['rgb(0, 0, 0)'], 'white lyrics chosen for the screen still print black');
    pass('the lyric colour chosen in Ajustes never reaches the paper');

    // ----- the setlist: one song per page, in the order of the Mass, key of the list -----
    await page.goto(`${server.base}/listados/${sheetCases.setlist}`);
    await page.getByRole('heading', { name: 'Ofertorio', exact: true }).waitFor();
    await choosePrintFromList(page, 'Con acordes');
    const order = await page.locator('#print-root .page-title').allTextContents();
    assert.deepEqual(order, [SAMPLES[0]?.title, SAMPLES[2]?.title, SAMPLES[1]?.title], 'entrada, ofertorio, comunión');
    const subtitles = await page.locator('#print-root .page-head__sub').allTextContents();
    assert.deepEqual(subtitles.map((s) => s.split(' · ')[1]), ['Canto de entrada', 'Ofertorio', 'Canto de comunión']);
    const listed = await toPdf(page);
    assert.equal(listed.length, 3);
    assert.ok(listed[0]?.join(' ').includes(SAMPLES[0]?.title ?? '?'));
    assert.ok(listed[1]?.join(' ').includes(SAMPLES[2]?.title ?? '?'));
    pass('a setlist prints one song per page, in the order of the Mass');

    // ----- the cascade against Chromium's printer -----
    // Every sample on its own printout; each must fit the way PrintLayout said
    await page.goto(`${server.base}/`);
    await page.getByRole('heading', { name: 'Cantos' }).waitFor();
    const layouts = await printEverySample(page, sheetCases.ids);
    const seen = new Set<string>();
    for (const row of layouts) {
        seen.add(row.layout);
        // "pages" is also what anything near the limit of "columns" gets, which may well fit on one
        if (row.layout !== 'pages') {
            assert.equal(row.pages, 1, `${row.title}: planned as "${row.layout}", printed on ${row.pages} pages`);
        }
        // Nothing is ever cut off: every line of the song is on paper
        const stanzas = Number(/\d+$/.exec(row.title)?.[0]);
        assert.equal(row.lines, stanzas * 4, `${row.title}: lines on paper`);
    }
    assert.deepEqual([...seen].sort(), ['columns', 'compact', 'normal', 'pages'], 'every layout was exercised');
    pass(`PrintLayout agrees with Chromium's printer on ${layouts.length} songs (${[...seen].sort().join(', ')})`);

    assert.deepEqual(violations, [], 'the print page must not break the production policy');
    assert.deepEqual(problems, []);
    pass('printing breaks no rule of the Content-Security-Policy');

    // ----- offline: the fonts come from the shell cache -----
    const offlineContext = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    await offlineContext.addInitScript(() => {
        window.print = () => undefined;
    });
    const offline = await offlineContext.newPage();
    await signIn(offline, server.base);
    await synced(offline);
    await offline.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await offline.waitForFunction(async () => (await caches.keys()).length > 0);
    await offlineContext.setOffline(true);
    await offline.reload();
    await offline.getByRole('heading', { name: 'Cantos' }).waitFor();
    await offline.getByRole('link', { name: SAMPLES[0]?.title ?? '' }).first().click();
    await offline.locator('#song-sheet .ch').first().waitFor();
    await offline.locator('.print-menu summary').click();
    await offline.getByRole('button', { name: 'Con acordes', exact: true }).click();
    await offline.locator('#print-root .print-page').waitFor({ state: 'attached' });
    const fonts = await offline.evaluate(async () => {
        await document.fonts.load('700 13pt "Atkinson Hyperlegible"');
        return document.fonts.check('700 13pt "Atkinson Hyperlegible"');
    });
    assert.equal(fonts, true, 'the print font loads with no connection');
    pass('the print fonts are in the shell cache: printing works offline');
} finally {
    await browser.close();
    server.stop();
}

console.log(`\n${count()} checks passed`);

/** Prints each sample on its own and reports the layout class it got and the pages it took */
async function printEverySample(page: Page, ids: string[]): Promise<{ title: string; layout: string; pages: number; lines: number }[]> {
    const rows: { title: string; layout: string; pages: number; lines: number }[] = [];
    for (const id of ids) {
        await page.goto(`${server.base}/cantos/${id}`);
        await page.locator('#song-sheet').waitFor();
        const title = (await page.locator('.viewer-content h2').textContent()) ?? '';
        await choosePrint(page, title.startsWith('Solo letra') ? 'Solo letra' : 'Con acordes');
        const layout = await page.locator('#print-root .song-sheet').getAttribute('class') ?? '';
        const kind = /song-sheet--(\w+)-/.exec(layout)?.[1] ?? 'normal';
        const printed = await toPdf(page);
        const lines = (printed.flat().join('').match(/mento/g) ?? []).length;
        rows.push({ title, layout: kind, pages: printed.length, lines });
    }

    return rows;
}
