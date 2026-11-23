/**
 * Browser test of the editor's format buttons (minúsculas, MAYÚSCULAS, Tipo oración: the words only, the selected lines or all
 * of them, with "Deshacer") and of the "Indicación" button, and of how an indication reads in the preview: an italic note with no
 * label and no verse number, and no empty row under an intro of chords.
 *
 *     npm run build && node tests/e2e/format.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer } from './lib.ts';

const server = await startServer(18109);
const { pass, count } = reporter();

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
    await page.getByRole('button', { name: 'Minúsculas' }).click();
    assert.equal(await body.inputValue(), '{c: Coro}\naleluya[D]aaa[G]a, aleluya\npreparad el señor.\n\n{ci: Intro}\n[C] [G]\n\nallanad sus sendas');
    assert.equal(await note.locator('span').innerText(), 'Letra en minúsculas');
    await note.getByRole('button', { name: 'Deshacer' }).click();
    assert.equal(await body.inputValue(), TEXT);
    pass('minúsculas changes the words and not the chords or the directives, and "Deshacer" gives them back');

    // Tipo oración: a capital at each paragraph and sentence, and on the names of the faith
    await page.getByRole('button', { name: 'Tipo oración' }).click();
    assert.equal(await body.inputValue(), '{c: Coro}\nAleluya[D]aaa[G]a, aleluya\npreparad el Señor.\n\n{ci: Intro}\n[C] [G]\n\nAllanad sus sendas');
    await note.getByRole('button', { name: 'Deshacer' }).click();
    pass('tipo oración puts the capitals where a paragraph or a sentence starts, and keeps "Señor"');

    // A selection changes only the lines it touches (the whole line: a chord is never cut)
    await body.evaluate((element) => {
        const area = element as HTMLTextAreaElement;
        const at = area.value.indexOf('PREPARAD');
        area.focus();
        area.setSelectionRange(at + 3, at + 5);
    });
    await page.getByRole('button', { name: 'Minúsculas' }).click();
    assert.equal(await body.inputValue(), TEXT.replace('PREPARAD EL SEÑOR.', 'preparad el señor.'));
    assert.match(await note.locator('span').innerText(), /seleccionadas/);
    await note.getByRole('button', { name: 'Deshacer' }).click();
    // Nothing to change says so, with nothing to give back
    await page.getByRole('button', { name: 'Mayúsculas' }).click();
    await page.getByRole('button', { name: 'Mayúsculas' }).click();
    assert.equal(await note.locator('span').innerText(), 'La letra ya estaba así');
    assert.equal(await note.getByRole('button', { name: 'Deshacer' }).isVisible(), false);
    pass('a selection changes the lines it touches; a text already in that case says so');

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
    await page.getByRole('button', { name: 'Indicación' }).click();
    for (const letter of 'Repetir 2 veces') {
        await page.keyboard.press(letter);
    }
    assert.equal(await body.inputValue(), TEXT.replace('ALLANAD SUS SENDAS', 'ALL\n{ci: Repetir 2 veces}\nANAD SUS SENDAS'));
    await page.locator('.song-sheet .line--note', { hasText: 'Repetir 2 veces' }).waitFor();
    pass('the "Indicación" button puts {ci: } on a line of its own and the cursor inside it');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
