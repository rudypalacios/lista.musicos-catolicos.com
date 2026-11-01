/**
 * Browser test of sharing a list by a link: the owner shares it from the app, somebody with no session opens the link and
 * reads it (as a page of the public site looks), changes the key for themselves, and the owner switches the lyrics off and
 * then stops sharing. The visitor's pages run under the production Content-Security-Policy and must ask for nothing from
 * another origin.
 *
 *     npm run build && node tests/e2e/share.ts
 */
import assert from 'node:assert/strict';
import { chromium, enforcePolicy, openSection, reporter, signIn, startServer } from './lib.ts';

const TITLE = 'Misa del 1 de noviembre';
const SONG_ONE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SONG_TWO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LIST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const payload = {
    songs: [
        { id: SONG_ONE, title: 'Caminamos con alegría', author: 'Ana Pérez', body: '{key: C}\n[C]Caminamos con [G]alegría\n[Am]por el [F]camino', updatedAt: 1_700_000_000_000, deleted: false },
        { id: SONG_TWO, title: 'Pan de vida', author: '', body: '[G]Pan de [C]vida', updatedAt: 1_700_000_001_000, deleted: false },
    ],
    setlists: [{
        id: LIST, title: TITLE, eventDate: null, notes: 'nota privada',
        items: [
            { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', part: 'entrada', songId: SONG_ONE, transpose: 2, note: 'privado' },
            { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', part: 'comunion', songId: SONG_TWO, transpose: 0, note: '' },
        ],
        parts: [{ id: 'entrada', name: 'Canto de entrada' }, { id: 'comunion', name: 'Canto de comunión' }],
        updatedAt: 1_700_000_002_000, deleted: false,
    }],
};

const server = await startServer(18100);
const { pass, count } = reporter();
const browser = await chromium.launch();

try {
    // ----- the owner shares the list -----
    const owner = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, serviceWorkers: 'block' })).newPage();
    const problems: string[] = [];
    owner.on('pageerror', (error) => problems.push(error.message));
    await signIn(owner, server.base);
    await owner.evaluate(async (data) => {
        await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }, payload);
    await owner.reload();
    await openSection(owner, 'Listados');
    await owner.getByText(TITLE).first().waitFor();
    await owner.getByRole('button', { name: `Más opciones: ${TITLE}` }).click();
    await owner.getByRole('button', { name: 'Compartir listado' }).click();
    await owner.getByText('Cualquiera con el enlace podrá ver este listado').waitFor();
    assert.equal(await owner.getByRole('switch').first().getAttribute('aria-checked'), 'true', 'the lyrics go with it unless the person says no');
    await owner.getByText('Las letras y los acordes pertenecen a sus autores').waitFor();
    pass('sharing: the row\'s "⋯" has "Compartir listado"; its sheet asks about the lyrics and says the words belong to their authors');

    await owner.getByRole('button', { name: 'Crear enlace' }).click();
    await owner.getByText('Compartido · con letra y acordes').waitFor();
    const url = (await owner.locator('.share__url').textContent()) ?? '';
    assert.match(url, new RegExp(`^${server.base}/c/[0-9a-f]{32}$`));
    await owner.getByRole('button', { name: 'Copiar' }).click();
    await owner.locator('.toast').waitFor();
    pass('sharing: the link is made, shown, and copying says it did (or how to copy by hand)');

    // ----- a visitor with no session reads it -----
    const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const visitor = await visitorContext.newPage();
    const violations = await enforcePolicy(visitorContext, visitor);
    const hosts = new Set<string>();
    visitor.on('request', (request) => hosts.add(new URL(request.url()).host));
    const visitorProblems: string[] = [];
    visitor.on('pageerror', (error) => visitorProblems.push(error.message));
    await visitor.goto(url);
    await visitor.getByRole('heading', { name: TITLE }).waitFor();
    await visitor.getByText('Músicos Católicos').first().waitFor();
    assert.equal(await visitor.locator('.bar, .menu, nav[aria-label="Menú"]').count(), 0, 'no bar or menu of the app');
    // The foot of the site is folded away: only its tab shows, and the links are not reachable until it is opened
    assert.equal(await visitor.getByText('Derechos de autor').first().isVisible(), false, 'the foot is folded');
    await visitor.getByRole('button', { name: 'Mostrar el pie' }).click();
    await visitor.getByText('Derechos de autor').first().waitFor();
    assert.equal(await visitor.getByText('Para uso personal. Las letras y los acordes pertenecen a sus autores.').first().isVisible(), true);
    await visitor.getByRole('button', { name: 'Ocultar el pie' }).click();
    await visitor.getByText('Derechos de autor').first().waitFor({ state: 'hidden' });
    const rows = await visitor.locator('.pub-row').allTextContents();
    assert.equal(rows.length, 2);
    assert.match(rows[0] ?? '', /Caminamos con alegría/);
    assert.match(rows[0] ?? '', /Re/, 'the key the list has it in');
    for (const private_ of ['nota privada', 'privado', 'owner@example.com']) {
        assert.equal(await visitor.getByText(private_).count(), 0, private_);
    }
    pass('visitor: the list opens with no session, thin, with the foot folded away that opens and closes, the keys of the list and nothing personal');

    await visitor.getByText('Caminamos con alegría').first().click();
    await visitor.locator('.song-sheet').waitFor();
    assert.equal(await visitor.locator('.pub-bar__text b').textContent(), 'Caminamos con alegría');
    assert.match(visitor.url(), /\/c\/[0-9a-f]{32}\/1$/);
    assert.equal(await visitor.locator('.pub-head').count(), 0, 'a song has no header of the site: the screen is the lyrics');
    const chord = visitor.locator('.song-sheet .ch').first();
    assert.equal(await chord.textContent(), 'Re');
    // The tools are folded under the bar: only their button shows
    assert.equal(await visitor.getByRole('button', { name: 'Subir medio tono' }).isVisible(), false, 'the tools are folded');
    await visitor.getByRole('button', { name: 'Herramientas' }).click();
    await visitor.getByRole('button', { name: 'Subir medio tono' }).click();
    assert.equal(await chord.textContent(), 'Mib');
    await visitor.getByRole('button', { name: /Volver al tono del listado/ }).click();
    assert.equal(await chord.textContent(), 'Re');
    await visitor.getByRole('button', { name: 'Letra más grande' }).click();
    await visitor.getByRole('button', { name: 'Imprimir' }).click();
    await visitor.getByRole('button', { name: /Con acordes/ }).waitFor();
    await visitor.getByRole('button', { name: /Solo letra/ }).waitFor();
    await visitor.keyboard.press('Escape');
    await visitor.getByRole('button', { name: /Con acordes/ }).waitFor({ state: 'hidden' });
    await visitor.getByRole('button', { name: 'Plegar las herramientas' }).click();
    await visitor.getByRole('button', { name: 'Subir medio tono' }).waitFor({ state: 'hidden' });
    pass('visitor: a song opens in the list\'s key with the tools folded under the bar; the key moves and comes back, the lyrics grow, printing offers its two sheets');

    await visitor.reload();
    await visitor.locator('.song-sheet').waitFor();
    assert.equal(await visitor.locator('.song-sheet .ch').first().textContent(), 'Re', 'what the visitor changed was only theirs, for now');
    await visitor.getByRole('button', { name: 'Canto siguiente' }).click();
    await visitor.getByText('Pan de vida').first().waitFor();
    assert.equal(await visitor.locator('.pub-bar__text b').textContent(), 'Pan de vida');
    await visitor.keyboard.press('ArrowLeft');
    await visitor.locator('.pub-bar__text b', { hasText: 'Caminamos con alegría' }).waitFor();
    await visitor.goBack();
    await visitor.getByText('Pan de vida').first().waitFor();
    pass('visitor: the addresses are real: reload and back work, ‹ › and the arrow keys change the song');

    assert.deepEqual([...hosts], [new URL(server.base).host], 'the page asked for nothing from another origin');
    assert.deepEqual(violations, [], 'the production security policy is respected');
    assert.deepEqual(visitorProblems, []);
    pass('visitor: no request to another origin, no policy violation, no uncaught error');

    // ----- the same app: a swipe changes the song, and the list opens with no connection -----
    const touch = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, serviceWorkers: 'block' });
    const phone = await touch.newPage();
    await phone.goto(`${url}/1`);
    await phone.locator('.song-sheet').waitFor();
    const cdp = await touch.newCDPSession(phone);
    const finger = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number): Promise<unknown> =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await finger('touchStart', 320, 400);
    for (const x of [280, 240, 200, 160, 120]) {
        await finger('touchMove', x, 404);
    }
    await finger('touchEnd', 0, 0);
    await phone.locator('.pub-bar__text b', { hasText: 'Pan de vida' }).waitFor();
    assert.match(phone.url(), /\/2$/);
    await finger('touchStart', 80, 400);
    for (const x of [120, 160, 200, 240, 280]) {
        await finger('touchMove', x, 396);
    }
    await finger('touchEnd', 0, 0);
    await phone.locator('.pub-bar__text b', { hasText: 'Caminamos con alegría' }).waitFor();
    pass('visitor: swiping the song to the left brings the next one and to the right the one before, as when singing a list');

    const installed = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const reading = await installed.newPage();
    await reading.goto(url);
    await reading.getByRole('heading', { name: TITLE }).waitFor();
    await reading.getByText('Disponible sin conexión').waitFor();
    await reading.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await reading.reload();
    assert.equal(await reading.evaluate(() => navigator.serviceWorker.controller !== null), true, 'the app\'s worker keeps the page for a visitor too');
    // The answer may be kept a minute by the browser itself: it is cleared so the page really finds no connection
    await (await installed.newCDPSession(reading)).send('Network.clearBrowserCache');
    await installed.setOffline(true);
    await reading.reload();
    await reading.getByRole('heading', { name: TITLE }).waitFor();
    await reading.getByText('Sin conexión.').waitFor();
    await reading.getByText(/Estás leyendo la copia guardada el/).waitFor();
    await reading.getByText('Caminamos con alegría').first().click();
    await reading.locator('.song-sheet').waitFor();
    assert.equal(await reading.locator('.song-sheet .ch').first().textContent(), 'Re');
    pass('offline: a list opened once is read again with no connection, a song included, and the page says it is a copy and from when');

    // ----- the owner switches the lyrics off -----
    await owner.getByRole('switch').first().click();
    await owner.getByText('Compartido · solo el orden').waitFor();
    assert.equal(await owner.locator('.share__url').textContent(), url, 'the link does not change');
    await visitor.goto(url);
    await visitor.getByText('Quien lo compartió eligió mostrar solo el orden').waitFor();
    assert.equal(await visitor.locator('a.pub-row').count(), 0, 'the rows are not links');
    await visitor.goto(`${url}/1`);
    await visitor.getByText('Quien lo compartió eligió mostrar solo el orden').waitFor();
    assert.equal(await visitor.locator('.song-sheet').count(), 0, 'the lyrics are not there even when the address of a song is asked');
    pass('switching the lyrics off changes what the same link shows, even for the address of a song');

    // ----- the owner stops sharing -----
    await owner.getByRole('button', { name: 'Dejar de compartir' }).click();
    await owner.getByRole('alertdialog').waitFor();
    await owner.locator('.confirm__buttons .button--danger-solid').click();
    await owner.getByText('Ya no se comparte').waitFor();
    await visitor.goto(url);
    await visitor.getByText('Este enlace ya no existe').waitFor();
    const stopped = await visitor.locator('.pub-gone').textContent();
    await visitor.goto(`${server.base}/c/${'0'.repeat(32)}`);
    await visitor.getByText('Este enlace ya no existe').waitFor();
    assert.equal(await visitor.locator('.pub-gone').textContent(), stopped, 'a stopped and an invented link look the same');
    pass('stopping: the link stops working at once, and says the same as one that never existed');

    // The copy the visitor kept goes when the link is found stopped; with no connection there is then nothing to read
    await installed.setOffline(false);
    await reading.goto(url);
    await reading.getByText('Este enlace ya no existe').waitFor();
    await installed.setOffline(true);
    await reading.reload();
    await reading.getByText('Sin conexión').first().waitFor();
    await reading.getByText('todavía no está guardado en este dispositivo').waitFor();
    pass('offline: when the link was stopped the kept copy is forgotten, and a list never opened says it needs a connection');

    assert.deepEqual(problems, []);
    pass('no uncaught errors for the owner');
    console.log(`\n${count()} checks passed`);
} catch (error) {
    console.error('\nFAILED:', error);
    process.exitCode = 1;
} finally {
    await browser.close();
    server.stop();
}
