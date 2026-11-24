/**
 * Browser test of the chords put on the syllables of the editor's preview: a syllable touched opens a sheet in the editor's foot, the
 * chord is put together from its pieces and written into the text with every touch, a marked piece touched again takes it away, the
 * chords of the song are offered again in one row, the handle of the sheet follows the finger between its levels (phone), the sheet is
 * shown whole with no gesture on a wide screen, and the notes follow the notation of Ajustes.
 *
 *     npm run build && node tests/e2e/chords.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer } from './lib.ts';
import type { Locator, Page } from 'playwright';

const server = await startServer(18110);
const { pass, count } = reporter();

/** The text the editor holds, whichever pane is showing */
const text = (page: Page): Promise<string> => page.locator('#body').inputValue();
/** The place whose words are exactly this syllable (its chord, if it has one, is not part of what is looked for) */
const syllable = (page: Page, word: string): Locator =>
    page.locator('.song-sheet--edit .seg[data-place]').filter({ has: page.locator('.lyr', { hasText: new RegExp(`^\\s*${word}\\s*$`) }) }).first();
const chip = (page: Page, act: string, value: string): Locator => page.locator(`.chord-chip[data-act="${act}"][data-v="${value}"]`);
const settle = (page: Page): Promise<void> => page.waitForTimeout(450);
const dockOpen = async (page: Page): Promise<boolean> => (await page.locator('.chord-dock:not([hidden])').count()) === 1;

/** A drag of the finger, `dy` px in `ms`: slow enough to be a drag and not a flick */
async function drag(page: Page, x: number, y: number, dy: number, ms: number): Promise<void> {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
        await page.mouse.move(x, y + (dy * step) / 10);
        await page.waitForTimeout(ms / 10);
    }
    await page.mouse.up();
    await settle(page);
}

async function newSong(page: Page, body: string): Promise<void> {
    await page.goto(`${server.base}/cantos/nuevo`);
    await page.getByLabel('Título').fill('Quédate');
    await page.locator('#body').fill(body);
}

const browser = await chromium.launch();
try {
    const problems: string[] = [];
    const watch = (page: Page): void => {
        page.on('pageerror', (error) => problems.push(error.message));
    };

    // ---------- a phone ----------
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage();
    watch(phone);
    await signIn(phone, server.base);
    await newSong(phone, 'Quédate con[D]migo, Señor,\nque ya cae la tarde.');
    await phone.getByRole('tab', { name: 'Ver' }).click();

    // Every syllable is a place, also in a line with no chord at all; the places are the ones the preview drew
    assert.ok((await phone.locator('.seg[data-place]').count()) >= 10, 'syllables to touch');
    assert.equal(await phone.locator('.chord-dock:not([hidden])').count(), 0, 'nothing open until a syllable is touched');
    pass('every syllable of the preview is a place for a chord, in lines with chords and in lines without');

    // Touch a syllable of the plain line, then a note: the chord is written before the syllable, at once
    await syllable(phone, 'tar').click();
    await settle(phone);
    assert.ok(await dockOpen(phone), 'the sheet opens');
    assert.equal(await phone.locator('.chord-sheet__chord').innerText(), '—', 'no chord yet');
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), false, 'low: only the notes and the chords of the song');
    await chip(phone, 'root', 'G').click();
    await settle(phone);
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [G]tarde.');
    assert.equal(await phone.locator('.chord-sheet__chord').innerText(), 'Sol');
    assert.equal(await phone.locator('.chord-sheet__code').innerText(), '[G]', 'the stored name is shown under it, in Latin');
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), true, 'touching a note expands the sheet: it is being built');
    pass('a syllable touched opens the sheet and a note touched writes the chord before it');

    // The pieces: terms, number, sharp, bass
    await chip(phone, 'term', 'm').click();
    await chip(phone, 'num', '7').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [Gm7]tarde.');
    await chip(phone, 'acc', '1').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [G#m7]tarde.');
    await chip(phone, 'bassopen', '').click();
    await chip(phone, 'bass', 'D').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [G#m7/D]tarde.');
    assert.equal(await phone.locator('.chord-sheet__chord').innerText(), 'Sol#m7/Re');
    await chip(phone, 'term', 'm').click();
    await chip(phone, 'bass', 'D').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [G#7]tarde.');
    await phone.locator('.chord-sheet__other').fill('(b5)');
    await phone.locator('.chord-sheet__other').press('Enter');
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [G#7(b5)]tarde.');
    pass('the chord is built from note, sharp, number, terms, bass and "otro", and written with every touch');

    // Another note changes the note and keeps the rest; the same note touched again takes the chord away
    await chip(phone, 'root', 'A').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la [Bb7(b5)]tarde.', 'the black keys are spelled C# D# F# G# Bb');
    await chip(phone, 'root', 'A').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la tarde.', 'a marked note touched again: no chord');
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__chord').innerText(), '—');
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), false, 'and the sheet is low again');
    pass('another note changes the note and keeps the pieces; a marked note touched again takes the chord out');

    // The chords of the song in one row: a touch writes it (and does not expand), and the one the syllable has is marked
    await syllable(phone, 'ya').click();
    await settle(phone);
    await phone.locator('.chord-chip[data-act="use"]', { hasText: 'Re' }).click();
    await settle(phone);
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque [D]ya cae la tarde.');
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), false, 'repeating a chord does not open the details');
    assert.equal(await phone.locator('.chord-chip[data-act="use"].is-on').innerText(), 'Re', 'the chord of the syllable is marked');
    assert.equal(await phone.locator('.chord-chip[data-act="root"].is-on').count(), 0, 'and no note is: a note touched now starts from zero');
    await phone.locator('.chord-chip[data-act="use"].is-on').click();
    assert.equal(await text(phone), 'Quédate con[D]migo, Señor,\nque ya cae la tarde.', 'the marked chord touched again takes it out');
    pass('"En este canto" repeats a chord with one touch, marks the syllable\'s own and takes it out when touched again');

    // A note touched on a syllable that has a chord starts from zero (no terms carried over)
    await syllable(phone, 'mi').click();
    await settle(phone);
    await chip(phone, 'root', 'E').click();
    assert.equal(await text(phone), 'Quédate con[E]migo, Señor,\nque ya cae la tarde.');
    await chip(phone, 'term', 'm').click();
    assert.equal(await text(phone), 'Quédate con[Em]migo, Señor,\nque ya cae la tarde.');
    await syllable(phone, 'ya').click();
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__chord').innerText(), '—', 'another syllable: the sheet moves, nothing is closed or kept');
    assert.ok(await dockOpen(phone));
    pass('touching another syllable moves the sheet to it');

    // The handle: it follows the finger up and down, and rests at the nearest level
    await syllable(phone, 'mi').click();
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), false);
    const sheetTop = async (): Promise<number> => (await phone.locator('.chord-sheet').boundingBox())?.y ?? NaN;
    const handleColour = (): Promise<string> => phone.locator('.chord-sheet__head--grip').evaluate((element) => getComputedStyle(element, '::before').backgroundColor);
    const grip = await phone.locator('.chord-sheet__head--grip').boundingBox();
    assert.ok(grip !== null);
    const x = grip.x + 60;
    const y = grip.y + 20;
    const rest = await handleColour();
    const lowTop = await sheetTop();
    await phone.mouse.move(x, y);
    await phone.mouse.down();
    await phone.mouse.move(x, y - 40, { steps: 5 });
    await phone.waitForTimeout(250);
    const held = await handleColour();
    assert.notEqual(held, rest, 'the handle changes colour while it is held');
    assert.equal(held, await phone.locator('.chord-sheet__close').evaluate((element) => getComputedStyle(element).color), 'to the colour of the text');
    const partway = await sheetTop();
    assert.ok(partway < lowTop - 30, `the sheet follows the finger up (${lowTop} → ${partway})`);
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), true, 'and shows what was below the fold while it moves');
    await phone.mouse.move(x, y - 200, { steps: 8 });
    await phone.mouse.up();
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__head--grip').getAttribute('aria-expanded'), 'true', 'let go far up: expanded');
    assert.equal(await handleColour(), rest, 'the handle goes back to its colour');
    assert.equal(await phone.locator('.chord-chip[data-act="root"].is-on').innerText(), 'Mi', 'pulled up, the chord of the syllable is loaded into the builder');
    assert.equal(await phone.locator('.chord-chip[data-act="term"].is-on').innerText(), 'm');
    pass('the handle follows the finger, changes colour while held, and rests at the nearest level');

    // Down a little: back where it was; down to the low level, then closed (slowly, as a person drags: a flick goes further)
    const expandedTop = await sheetTop();
    const grip2 = (await phone.locator('.chord-sheet__head--grip').boundingBox())!;
    await drag(phone, x, grip2.y + 20, 15, 300);
    assert.equal(Math.round(await sheetTop()), Math.round(expandedTop), 'a short drag goes back');
    await drag(phone, x, grip2.y + 20, 200, 1200);
    assert.equal(await phone.locator('.chord-sheet__head--grip').getAttribute('aria-expanded'), 'false', 'down: low');
    assert.ok(await dockOpen(phone), 'and still open');
    const grip3 = (await phone.locator('.chord-sheet__head--grip').boundingBox())!;
    await drag(phone, x, grip3.y + 20, 260, 1000);
    assert.equal(await dockOpen(phone), false, 'down again from low: closed');
    assert.equal(await phone.locator('.seg.is-picked').count(), 0, 'and nothing is marked in the preview');
    // A quick flick goes further than the same drag made slowly: from low, a short fast flick up expands it
    await syllable(phone, 'mi').click();
    await settle(phone);
    const grip4 = (await phone.locator('.chord-sheet__head--grip').boundingBox())!;
    await phone.mouse.move(x, grip4.y + 20);
    await phone.mouse.down();
    await phone.mouse.move(x, grip4.y - 20, { steps: 2 });
    await phone.mouse.up();
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__head--grip').getAttribute('aria-expanded'), 'true', 'a quick flick up expands it, though it is a short drag');
    pass('a short drag goes back, a long one down folds the sheet, and again closes it');

    // A tap on the handle toggles; the close button, Escape and a touch on an empty place of the preview close it
    await phone.getByRole('button', { name: 'Cerrar' }).click();
    await settle(phone);
    await syllable(phone, 'mi').click();
    await settle(phone);
    await phone.locator('.chord-sheet__head--grip').click({ position: { x: 60, y: 24 } });
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), true, 'a tap on the handle expands');
    await phone.locator('.chord-sheet__head--grip').click({ position: { x: 60, y: 24 } });
    await settle(phone);
    assert.equal(await phone.locator('.chord-sheet__more').isVisible(), false, 'and another folds');
    await phone.getByRole('button', { name: 'Cerrar' }).click();
    await settle(phone);
    assert.equal(await dockOpen(phone), false, 'the close button');
    await syllable(phone, 'ya').click();
    await settle(phone);
    await phone.keyboard.press('Escape');
    await settle(phone);
    assert.equal(await dockOpen(phone), false, 'Escape');
    await syllable(phone, 'ya').click();
    await settle(phone);
    await phone.locator('.song-sheet--edit').click({ position: { x: 4, y: 4 } });
    await settle(phone);
    assert.equal(await dockOpen(phone), false, 'a touch on an empty place of the preview');
    await syllable(phone, 'ya').click();
    await settle(phone);
    await phone.getByRole('tab', { name: 'Escribir' }).click();
    assert.equal(await dockOpen(phone), false, 'going back to the lyrics');
    pass('a tap on the handle toggles; the close button, Escape, an empty place and the other tab close the sheet');

    // The syllable touched stays above the sheet, also in the last line of a long song
    const long = Array.from({ length: 30 }, (_, line) => `Línea número ${line + 1} del canto largo`).join('\n');
    await newSong(phone, long);
    await phone.getByRole('tab', { name: 'Ver' }).click();
    await phone.locator('.song-sheet--edit .line').last().locator('.seg[data-place]').last().click();
    await settle(phone);
    const picked = await phone.locator('.seg.is-picked').boundingBox();
    const dock = await phone.locator('.chord-dock').boundingBox();
    assert.ok(picked !== null && dock !== null);
    assert.ok(picked.y + picked.height <= dock.y + 1, `the syllable (${picked.y + picked.height}) is above the sheet (${dock.y})`);
    const foot = await phone.locator('.edit-foot').boundingBox();
    assert.ok(foot !== null);
    assert.ok(Math.abs(dock.y + dock.height - foot.y) <= 1.5, `the sheet rests on the foot (${dock.y + dock.height} / ${foot.y})`);
    pass('the syllable touched is scrolled to above the sheet, and the sheet rests on Guardar and Cancelar');

    // Saved, the chords are in the song as the preview showed
    await phone.getByRole('tab', { name: 'Escribir' }).click();
    await newSong(phone, 'Hola mundo');
    await phone.getByRole('tab', { name: 'Ver' }).click();
    await syllable(phone, 'Ho').click();
    await chip(phone, 'root', 'C').click();
    await chip(phone, 'term', 'maj').click();
    await phone.getByRole('button', { name: 'Guardar' }).click();
    await phone.locator('.song-sheet .ch[data-chord="Cmaj7"]').waitFor();
    pass('what was put on the syllables is what is saved and shown when the song is read');

    // ---------- the notation of Ajustes ----------
    await phone.evaluate(() => localStorage.setItem('mc-notacion', 'en'));
    await newSong(phone, 'Hola mundo');
    await phone.getByRole('tab', { name: 'Ver' }).click();
    await syllable(phone, 'Ho').click();
    await settle(phone);
    assert.deepEqual(await phone.locator('.chord-chip[data-act="root"]').allInnerTexts(), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    await chip(phone, 'root', 'D').click();
    assert.equal(await phone.locator('.chord-sheet__chord').innerText(), 'D');
    assert.equal(await phone.locator('.chord-sheet__code').count(), 0, 'in English the stored name would only repeat it');
    await phone.evaluate(() => localStorage.removeItem('mc-notacion'));
    pass('the notes, the chord and the chords of the song follow the notation of Ajustes');

    // ---------- a wide screen: all of it, no gesture ----------
    const wide = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    watch(wide);
    await signIn(wide, server.base);
    await newSong(wide, 'Quédate con[Dm7]migo, Señor,\nque ya cae la tarde.');
    await syllable(wide, 'mi').click();
    await settle(wide);
    assert.equal(await wide.locator('.chord-sheet__head--grip').count(), 0, 'no handle');
    assert.equal(await wide.locator('.chord-sheet__more').isVisible(), true, 'the details are in view');
    assert.equal(await wide.locator('.chord-chip[data-act="root"].is-on').innerText(), 'Re', 'and the chord is loaded: its pieces are marked');
    assert.equal(await wide.locator('.chord-chip[data-act="term"].is-on').innerText(), 'm');
    const notesBox = await wide.locator('.chord-sheet__notes').boundingBox();
    const moreBox = await wide.locator('.chord-sheet__more').boundingBox();
    const sheetBox = await wide.locator('.chord-sheet').boundingBox();
    const pickedBox = await wide.locator('.seg.is-picked').boundingBox();
    assert.ok(notesBox !== null && moreBox !== null && sheetBox !== null && pickedBox !== null);
    assert.ok(moreBox.x >= notesBox.x + notesBox.width, 'the details are beside the notes, in a second column');
    assert.ok(sheetBox.height < 320, `so it is low (${Math.round(sheetBox.height)}px) and leaves the preview in sight`);
    assert.ok(pickedBox.y + pickedBox.height <= sheetBox.y + 1, 'with the syllable touched above it');
    await chip(wide, 'num', '9').click();
    assert.equal(await text(wide), 'Quédate con[Dm9]migo, Señor,\nque ya cae la tarde.', 'a number replaces the one the chord had');
    await chip(wide, 'root', 'D').click();
    assert.equal(await text(wide), 'Quédate conmigo, Señor,\nque ya cae la tarde.', 'the marked note touched again takes the chord out');
    pass('on a wide screen the sheet is shown whole in two columns, low, with the chord loaded and no gesture');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
