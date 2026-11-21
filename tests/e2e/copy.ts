/**
 * Browser test of copying a song and of "Duplicar canto". Selecting the lyrics of a song and copying them puts the chords
 * above the words on the clipboard (what the page draws is a chord name, a piece of words, another chord…, which pasted
 * is a mess), the whole song or only what was selected, and it pastes back into the editor as the same song.
 *
 *     npm run build && node tests/e2e/copy.ts
 */
import assert from 'node:assert/strict';
import { chromium, reporter, signIn, startServer } from './lib.ts';

const server = await startServer(18125);
const { pass, count } = reporter();
const browser = await chromium.launch();

const BODY = [
    '{c: Coro}',
    '[D]Ya no eres [G]pan y [D]vino,',
    'ahora que eres [G]cuerpo y [D]sangre, vives en [A]mí',
    '',
    '{c: Verso 1}',
    'de ro[G]dillas yo caigo al contem[D]plar tu bondad,',
    '[E]cómo no te voy a ado[A]rar',
].join('\n');

try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    await signIn(page, server.base);

    await page.getByRole('link', { name: 'Nuevo canto' }).click();
    await page.getByLabel('Título').fill('Ya no eres pan');
    await page.getByLabel('Letra con acordes').fill(BODY);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('heading', { name: 'Ya no eres pan' }).waitFor();

    /** What a copy of the selection puts on the clipboard (the page's own handler runs first; this reads what it set) */
    const copied = (select: string): Promise<string | null> => page.evaluate((how) => {
        const sheet = document.querySelector('.song-sheet') as HTMLElement;
        const range = document.createRange();
        const lines = sheet.querySelectorAll('.line');
        if (how === 'all') {
            range.selectNodeContents(sheet);
        } else {
            // From the "pan" of the first line to the end of the second one
            const walker = document.createTreeWalker(lines[0] as Element, NodeFilter.SHOW_TEXT);
            let first = walker.nextNode();
            while (first !== null && first.nodeValue !== 'pan') {
                first = walker.nextNode();
            }
            range.setStart(first as Node, 0);
            const second = lines[1];
            range.setEnd(second as Node, second?.childNodes.length ?? 0);
        }
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        let result: string | null = null;
        document.addEventListener('copy', (event) => { result = event.clipboardData?.getData('text/plain') ?? null; }, { once: true });
        document.execCommand('copy');

        return Promise.resolve(result);
    }, select);

    const whole = (await copied('all')) ?? '';
    assert.equal(whole, [
        'Coro',
        'Re         Sol   Re',
        'Ya no eres pan y vino,',
        '               Sol      Re               La',
        'ahora que eres cuerpo y sangre, vives en mí',
        '',
        'Verso 1',
        '     Sol                      Re',
        'de rodillas yo caigo al contemplar tu bondad,',
        'Mi                  La',
        'cómo no te voy a adorar',
    ].join('\n'));
    pass('copying the whole song puts each chord on its own line over the words it was sung with');

    const part = (await copied('part')) ?? '';
    assert.ok(part.startsWith('Sol'), part);
    assert.ok(!part.includes('Verso'), part);
    pass('copying part of a song copies only what was selected, the chord of the first syllable too');

    // With the chords turned off the copy is the words alone
    await page.evaluate(() => document.querySelector('.song-sheet')?.classList.add('is-lyrics-only'));
    assert.equal((await copied('all')) ?? '', [
        'Coro', 'Ya no eres pan y vino,', 'ahora que eres cuerpo y sangre, vives en mí', '', 'Verso 1',
        'de rodillas yo caigo al contemplar tu bondad,', 'cómo no te voy a adorar',
    ].join('\n'));
    await page.evaluate(() => document.querySelector('.song-sheet')?.classList.remove('is-lyrics-only'));
    pass('with the chords turned off, copying gives the words alone');

    // Pasted into the editor it becomes the song again
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('button', { name: 'Editar letra y acordes' }).click();
    const area = page.getByLabel('Letra con acordes');
    await area.fill('');
    await page.evaluate(({ text }: { text: string }) => {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        document.querySelector('textarea')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, { text: whole });
    const pasted = await area.inputValue();
    assert.ok(pasted.includes('[D]Ya no eres [G]pan y [D]vino,'), pasted);
    assert.ok(pasted.includes('ro[G]dillas'), pasted);
    pass('what is copied pastes into the editor as the same song, with every chord where it was');
    await page.getByRole('button', { name: 'Cancelar' }).click().catch(() => undefined);

    // Duplicar, from the song's own menu
    await page.goto(`${server.base}/`);
    await page.getByRole('link', { name: 'Cantos' }).first().click();
    await page.getByRole('button', { name: 'Más opciones: Ya no eres pan' }).click();
    await page.getByRole('button', { name: 'Duplicar canto' }).click();
    await page.getByRole('heading', { name: 'Copia de Ya no eres pan' }).waitFor();
    pass('"Duplicar canto" in the menu of the songs makes a copy and opens it');
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('button', { name: 'Duplicar canto' }).click();
    await page.getByText('Copiado de «Copia de Ya no eres pan»').waitFor();
    await page.getByRole('link', { name: 'Volver a Cantos' }).click();
    await page.getByText('3 cantos').waitFor();
    assert.deepEqual(await page.locator('.lrow__title').allTextContents(), ['Copia de Ya no eres pan', 'Copia de Ya no eres pan', 'Ya no eres pan']);
    pass('"Duplicar canto" in a song\'s own menu makes another copy, and a copy of a copy has one "Copia de"');

    assert.deepEqual(problems, [], 'no uncaught errors in the page');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
