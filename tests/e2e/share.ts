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
    await visitor.getByText('Derechos de autor').first().waitFor();
    assert.equal(await visitor.locator('.bar, .menu, nav[aria-label="Menú"]').count(), 0, 'no bar or menu of the app');
    assert.equal(await visitor.getByText('Para uso personal. Las letras y los acordes pertenecen a sus autores.').first().isVisible(), true);
    const rows = await visitor.locator('.pub-row').allTextContents();
    assert.equal(rows.length, 2);
    assert.match(rows[0] ?? '', /Caminamos con alegría/);
    assert.match(rows[0] ?? '', /Re/, 'the key the list has it in');
    for (const private_ of ['nota privada', 'privado', 'owner@example.com']) {
        assert.equal(await visitor.getByText(private_).count(), 0, private_);
    }
    pass('visitor: the list opens with no session, in the public site\'s look, with the keys of the list and nothing personal');

    await visitor.getByText('Caminamos con alegría').first().click();
    await visitor.getByRole('heading', { name: 'Caminamos con alegría' }).waitFor();
    assert.match(visitor.url(), /\/c\/[0-9a-f]{32}\/1$/);
    const chord = visitor.locator('.song-sheet .ch').first();
    assert.equal(await chord.textContent(), 'Re');
    await visitor.getByRole('button', { name: 'Subir medio tono' }).click();
    assert.equal(await chord.textContent(), 'Mib');
    await visitor.getByRole('button', { name: /Volver al tono del listado/ }).click();
    assert.equal(await chord.textContent(), 'Re');
    await visitor.getByRole('button', { name: 'Letra más grande' }).click();
    pass('visitor: a song opens in the list\'s key; the visitor can move it and come back, and make the lyrics bigger');

    await visitor.reload();
    await visitor.getByRole('heading', { name: 'Caminamos con alegría' }).waitFor();
    assert.equal(await visitor.locator('.song-sheet .ch').first().textContent(), 'Re', 'what the visitor changed was only theirs, for now');
    await visitor.getByRole('link', { name: /Pan de vida/ }).click();
    await visitor.getByRole('heading', { name: 'Pan de vida' }).waitFor();
    await visitor.goBack();
    await visitor.getByRole('heading', { name: 'Caminamos con alegría' }).waitFor();
    pass('visitor: the addresses are real: reload and back work, and the next song is one link away');

    assert.deepEqual([...hosts], [new URL(server.base).host], 'the page asked for nothing from another origin');
    assert.deepEqual(violations, [], 'the production security policy is respected');
    assert.deepEqual(visitorProblems, []);
    pass('visitor: no request to another origin, no policy violation, no uncaught error');

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
