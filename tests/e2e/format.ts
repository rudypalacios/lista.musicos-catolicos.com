/**
 * Browser test of the editor's format buttons (minúsculas, MAYÚSCULAS, Tipo oración: the words only, the selected lines or all
 * of them, with "Deshacer") and of the "Indicación" button, and of how an indication reads in the preview: an italic note with no
 * label and no verse number, and no empty row under an intro of chords.
 *
 *     npm run build && node tests/e2e/format.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer } from './lib.ts';
import type { Page } from 'playwright';

const server = await startServer(18109);
const { pass, count } = reporter();

/** Opens a menu of the bar of the lyrics and chooses an item of it */
async function choose(page: Page, menu: 'Formato' | 'Insertar', item: RegExp): Promise<void> {
    await page.getByRole('button', { name: menu }).click();
    await page.getByRole('menuitem', { name: item }).click();
}
const lower = (page: Page): Promise<void> => choose(page, 'Formato', /^minúsculas/);
const upper = (page: Page): Promise<void> => choose(page, 'Formato', /^MAYÚSCULAS/);
const sentence = (page: Page): Promise<void> => choose(page, 'Formato', /^Tipo oración/);

const TEXT = '{c: Coro}\nALELUYA[D]AAA[G]A, ALELUYA\nPREPARAD EL SEÑOR.\n\n{ci: Intro}\n[C] [G]\n\nALLANAD SUS SENDAS';

const browser = await chromium.launch();
try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, server.base);
    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill('Aleluya');
    const body = page.locator('textarea').first();
    await body.fill(TEXT);
    const note = page.locator('.note-bar--ok');

    // Minúsculas: every word, never a chord or a directive; Deshacer gives it back
    await lower(page);
    assert.equal(await body.inputValue(), '{c: Coro}\naleluya[D]aaa[G]a, aleluya\npreparad el señor.\n\n{ci: Intro}\n[C] [G]\n\nallanad sus sendas');
    assert.equal(await note.locator('span').innerText(), 'Letra en minúsculas');
    await note.getByRole('button', { name: 'Deshacer' }).click();
    assert.equal(await body.inputValue(), TEXT);
    pass('minúsculas changes the words and not the chords or the directives, and "Deshacer" gives them back');

    // Tipo oración: a capital at each paragraph and sentence
    await sentence(page);
    assert.equal(await body.inputValue(), '{c: Coro}\nAleluya[D]aaa[G]a, aleluya\npreparad el señor.\n\n{ci: Intro}\n[C] [G]\n\nAllanad sus sendas');
    await note.getByRole('button', { name: 'Deshacer' }).click();
    pass('tipo oración puts the capitals where a paragraph or a sentence starts');

    // A selection changes only the lines it touches (the whole line: a chord is never cut)
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        const at = area.value.indexOf('PREPARAD');
        area.focus();
        area.setSelectionRange(at + 3, at + 5);
    });
    await lower(page);
    assert.equal(await body.inputValue(), TEXT.replace('PREPARAD EL SEÑOR.', 'preparad el señor.'));
    assert.match(await note.locator('span').innerText(), /seleccionadas/);
    await note.getByRole('button', { name: 'Deshacer' }).click();
    // Two lines with chords, one of them typed in lowercase: only those lines change and no chord does
    await body.fill('Ale[g]luya, ale[Am]LUYA\nprepa[G]rad EL ca[a]mino\ntercera [D]LÍNEA');
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        area.focus();
        area.setSelectionRange(area.value.indexOf('luya'), area.value.indexOf('EL') + 2);
    });
    await upper(page);
    // Touching the button leaves the box, and the box writes the capitals of the chords it holds ([g] → [G]): that must not lose the selection
    assert.equal(await body.inputValue(), 'ALE[G]LUYA, ALE[Am]LUYA\nPREPA[G]RAD EL CA[A]MINO\ntercera [D]LÍNEA', 'two lines in capitals, the chords written as their own control writes them, the third line as it was');
    await note.getByRole('button', { name: 'Deshacer' }).click();
    await body.fill(TEXT);
    pass('a selection changes only the lines it touches, and no chord');

    // The preview: the intro of chords is a note and a row of chords, with no label, no number and no empty row; the verse after it is the first
    const intro = page.locator('.song-sheet .song-section', { has: page.locator('.line--note', { hasText: 'Intro' }) });
    assert.equal(await intro.locator('.song-section__label').count(), 0, 'no label');
    assert.equal(await intro.locator('.line--chords .lyr').first().isVisible(), false, 'no empty row under the chords');
    // Verses are numbered by a counter that a first line increments: the intro's does not, so the stanza after it is the first
    const increments = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.song-sheet .song-section--verse .line--first'))
        .map((line) => `${line.classList.contains('line--chords') ? 'chords' : 'words'}:${getComputedStyle(line).counterIncrement}`));
    assert.deepEqual(increments, ['chords:none', 'words:verse 1'], 'the stanza with words is the first verse: the intro takes no number');
    pass('an indication reads as a note in italics: no label, no verse number and no empty row under the chords');

    // "Indicación": on a line of its own, with the cursor inside the braces, and what is typed shows in the preview
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        const at = area.value.indexOf('ALLANAD') + 3;
        area.focus();
        area.setSelectionRange(at, at);
    });
    await choose(page, 'Insertar', /^Indicación/);
    for (const letter of 'Repetir 2 veces') {
        await page.keyboard.press(letter);
    }
    assert.equal(await body.inputValue(), TEXT.replace('ALLANAD SUS SENDAS', 'ALL\n{ci: Repetir 2 veces}\nANAD SUS SENDAS'));
    await page.locator('.song-sheet .line--note', { hasText: 'Repetir 2 veces' }).waitFor();
    pass('the "Indicación" button puts {ci: } on a line of its own and the cursor inside it');

    // One box: the bar sits flush on top of the text, inside one wrapper that has the only border
    const bar = await page.locator('.lyrics-toolbar').boundingBox();
    const area = await body.boundingBox();
    const box = await page.locator('.composer').boundingBox();
    assert.ok(bar !== null && area !== null && box !== null);
    assert.equal(Math.round(bar.y + bar.height), Math.round(area.y), 'the bar ends where the text begins: nothing between them');
    assert.equal(Math.round(bar.width), Math.round(area.width), 'and they are as wide as each other');
    assert.ok(box.x <= bar.x && box.x + box.width >= bar.x + bar.width, 'inside the wrapper');
    assert.equal(await body.evaluate((element) => getComputedStyle(element).borderTopWidth), '0px', 'the text has no border of its own');
    pass('the bar and the text are one box: flush, as wide as each other, with the border on the wrapper');

    // The menus: one at a time, closed by Escape or a touch outside; "Insertar" says what it will do with a selection
    await page.getByRole('button', { name: 'Insertar' }).click();
    assert.match(await page.locator('.lyrics-menu:not([hidden])').innerText(), /donde está el cursor/i);
    await page.getByRole('button', { name: 'Formato' }).click();
    assert.equal(await page.locator('.lyrics-menu:not([hidden])').count(), 1, 'one open at a time');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.lyrics-menu:not([hidden])').count(), 0, 'Escape closes it');
    await body.fill('Verso\nAle[G]luya\nprepa[D]rad\nfin');
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        area.focus();
        area.setSelectionRange(area.value.indexOf('luya'), area.value.indexOf('rad') + 2);
    });
    await page.getByRole('button', { name: 'Insertar' }).click();
    assert.match(await page.locator('.lyrics-menu:not([hidden])').innerText(), /con el texto seleccionado[\s\S]*rodea las líneas seleccionadas/i);
    await page.getByRole('heading', { name: 'Nuevo canto' }).click();
    assert.equal(await page.locator('.lyrics-menu:not([hidden])').count(), 0, 'a touch outside closes it');
    pass('the menus open one at a time, close on Escape or a touch outside, and "Insertar" speaks of the selection');

    // "Insertar" with a selection: Coro wraps the lines, and Sección turns them into the label
    await page.getByRole('button', { name: 'Insertar' }).click();
    await page.getByRole('menuitem', { name: /^Coro/ }).click();
    assert.equal(await body.inputValue(), 'Verso\n{soc}\nAle[G]luya\nprepa[D]rad\n{eoc}\nfin', '{soc} before the first line selected, {eoc} after the last');
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        area.focus();
        area.setSelectionRange(1, 3);
    });
    await choose(page, 'Insertar', /^Sección/);
    assert.equal((await body.inputValue()).split('\n')[0], '{c: Verso}', 'the line selected becomes the label');
    // Without a selection, the pair of the chorus goes in with the cursor between them
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
    });
    await choose(page, 'Insertar', /^Coro/);
    assert.ok((await body.inputValue()).endsWith('fin\n{soc}\n\n{eoc}'), 'the empty pair at the cursor');
    pass('"Insertar" with a selection wraps the lines in the chorus or turns them into the label; with a cursor it writes the empty pair');

    // Capo, tempo and compás go above the lyrics; the preview shows them, and a second capo goes to the first one's value
    await choose(page, 'Insertar', /^Capo/);
    await page.keyboard.press('2');
    assert.ok((await body.inputValue()).startsWith('{capo: 2}\n'), 'at the top of the text');
    await page.locator('.preview__notes .chip', { hasText: 'Capo 2' }).waitFor();
    await choose(page, 'Insertar', /^Tempo/);
    await page.keyboard.press('7');
    await page.keyboard.press('2');
    await page.locator('.preview__notes .chip', { hasText: 'Tempo 72' }).waitFor();
    await choose(page, 'Insertar', /^Capo/);
    assert.equal(await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;

        return area.value.slice(area.selectionStart, area.selectionEnd);
    }), '2', 'the value of the capo that is already there is selected, not a second capo written');
    assert.equal((await body.inputValue()).split('{capo:').length, 2, 'only one capo');
    pass('capo, tempo and compás go at the top, show in the preview, and an existing one is selected instead of repeated');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
