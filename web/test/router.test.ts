import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchRoute, parentOf, paths, sectionOf, titleOf } from '../src/router.ts';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('matchRoute', () => {
    it('knows the list, the forms and the song pages', () => {
        assert.deepEqual(matchRoute('/'), { name: 'list' });
        assert.deepEqual(matchRoute('/cantos'), { name: 'list' });
        assert.deepEqual(matchRoute('/cantos/nuevo'), { name: 'new' });
        assert.deepEqual(matchRoute('/cantos/importar'), { name: 'import' });
        assert.deepEqual(matchRoute(`/cantos/${ID}`), { name: 'view', id: ID });
        assert.deepEqual(matchRoute(`/cantos/${ID}/editar`), { name: 'edit', id: ID });
    });

    it('knows the install guide', () => {
        assert.deepEqual(matchRoute('/ayuda/instalar'), { name: 'install' });
        assert.deepEqual(matchRoute('/ayuda/instalar/'), { name: 'install' });
        assert.equal(paths.install(), '/ayuda/instalar');
    });

    it('ignores a trailing slash', () => {
        assert.deepEqual(matchRoute(`/cantos/${ID}/`), { name: 'view', id: ID });
    });

    it('does not mistake "nuevo" or "importar" for song ids', () => {
        assert.deepEqual(matchRoute('/cantos/nuevo/editar'), { name: 'edit', id: 'nuevo' });
        assert.equal(matchRoute('/cantos/nuevo').name, 'new');
    });

    it('answers not-found for anything else, including odd input', () => {
        for (const path of ['/otra', '/cantos/a/b/c', '/cantos/<script>', '/cantos/' + 'x'.repeat(80), '//evil.example']) {
            assert.equal(matchRoute(path).name, 'not-found', path);
        }
    });

    it('builds paths it can read back', () => {
        assert.deepEqual(matchRoute(paths.view(ID)), { name: 'view', id: ID });
        assert.deepEqual(matchRoute(paths.edit(ID)), { name: 'edit', id: ID });
        assert.deepEqual(matchRoute(paths.new()), { name: 'new' });
        assert.deepEqual(matchRoute(paths.import()), { name: 'import' });
        assert.deepEqual(matchRoute(paths.list()), { name: 'list' });
    });

    it('knows the setlist screens', () => {
        assert.deepEqual(matchRoute('/listados'), { name: 'lists' });
        assert.deepEqual(matchRoute('/listados/'), { name: 'lists' });
        assert.deepEqual(matchRoute(`/listados/${ID}`), { name: 'setlist', id: ID });
        assert.deepEqual(matchRoute(`/listados/${ID}/agregar/senor-ten-piedad`), { name: 'add', id: ID, part: 'senor-ten-piedad' });
        assert.deepEqual(matchRoute(`/listados/${ID}/cantar/3`), { name: 'perform', id: ID, n: 3 });
        assert.deepEqual(matchRoute(`/listados/${ID}/secciones`), { name: 'sections', id: ID });
    });

    it('sections of a list hang from the list, inside the lists section of the menu', () => {
        assert.deepEqual(matchRoute(paths.sections(ID)), { name: 'sections', id: ID });
        assert.deepEqual(parentOf({ name: 'sections', id: ID }), { path: `/listados/${ID}`, label: 'Listado' });
        assert.equal(sectionOf({ name: 'sections', id: ID }), 'lists');
    });

    it('builds setlist paths it can read back', () => {
        assert.deepEqual(matchRoute(paths.lists()), { name: 'lists' });
        assert.deepEqual(matchRoute(paths.setlist(ID)), { name: 'setlist', id: ID });
        assert.deepEqual(matchRoute(paths.addToSetlist(ID, 'comunion')), { name: 'add', id: ID, part: 'comunion' });
        assert.deepEqual(matchRoute(paths.perform(ID, 12)), { name: 'perform', id: ID, n: 12 });
    });

    it('refuses odd setlist paths', () => {
        for (const path of [
            `/listados/${ID}/agregar`, `/listados/${ID}/agregar/Entrada`, `/listados/${ID}/agregar/<x>`,
            `/listados/${ID}/agregar/${'a'.repeat(41)}`, `/listados/${ID}/cantar`, `/listados/${ID}/cantar/x`,
            `/listados/${ID}/cantar/-1`, `/listados/${ID}/cantar/1000`, `/listados/${ID}/otra`, '/listados/a/b/c/d',
        ]) {
            assert.equal(matchRoute(path).name, 'not-found', path);
        }
    });

    it('knows the settings screen, which belongs to no tab', () => {
        assert.deepEqual(matchRoute('/ajustes'), { name: 'settings' });
        assert.deepEqual(matchRoute('/ajustes/'), { name: 'settings' });
        assert.equal(paths.settings(), '/ajustes');
        assert.equal(sectionOf(matchRoute('/ajustes')), 'settings');
        assert.equal(sectionOf(matchRoute('/ayuda/instalar')), 'settings');
    });

    it('files each route under the right tab', () => {
        assert.equal(sectionOf(matchRoute('/')), 'songs');
        assert.equal(sectionOf(matchRoute(`/cantos/${ID}/editar`)), 'songs');
        assert.equal(sectionOf(matchRoute('/otra')), 'songs');
        for (const path of ['/listados', `/listados/${ID}`, `/listados/${ID}/agregar/entrada`, `/listados/${ID}/cantar/1`]) {
            assert.equal(sectionOf(matchRoute(path)), 'lists', path);
        }
    });
});

describe('parentOf', () => {
    it('gives a way back to the screens that hang from another', () => {
        assert.deepEqual(parentOf(matchRoute(`/cantos/${ID}`)), { path: '/', label: 'Cantos' });
        assert.deepEqual(parentOf(matchRoute('/cantos/nuevo')), { path: '/', label: 'Cantos' });
        assert.deepEqual(parentOf(matchRoute('/cantos/importar')), { path: '/', label: 'Cantos' });
        assert.deepEqual(parentOf(matchRoute(`/cantos/${ID}/editar`)), { path: `/cantos/${ID}`, label: 'Canto' });
        assert.deepEqual(parentOf(matchRoute(`/listados/${ID}`)), { path: '/listados', label: 'Listados' });
        assert.deepEqual(parentOf(matchRoute(`/listados/${ID}/agregar/entrada`)), { path: `/listados/${ID}`, label: 'Volver al listado' });
        assert.deepEqual(parentOf(matchRoute('/ayuda/instalar')), { path: '/ajustes', label: 'Ajustes' });
    });

    it('has none for the screens of a section, Ajustes, singing or an unknown address', () => {
        for (const path of ['/', '/listados', '/ajustes', `/listados/${ID}/cantar/1`, '/nada']) {
            assert.equal(parentOf(matchRoute(path)), null, path);
        }
    });
});

describe('titleOf', () => {
    it('names the screens of the menu', () => {
        assert.equal(titleOf(matchRoute('/')), 'Cantos');
        assert.equal(titleOf(matchRoute('/listados')), 'Listados');
        assert.equal(titleOf(matchRoute('/ajustes')), 'Ajustes');
        assert.equal(titleOf(matchRoute('/nada')), 'Lista');
    });
});

describe('a new song written from the picker of a part', () => {
    const into = { setlist: ID, part: 'entrada' };

    it('carries the part it is for and the title searched through the address', () => {
        const path = paths.new(into, 'Pan de vida & más');
        const [pathname, search] = path.split('?');
        assert.deepEqual(matchRoute(pathname ?? '', `?${search ?? ''}`), { name: 'new', into, title: 'Pan de vida & más' });
    });

    it('has no extra address when it starts from nothing', () => {
        assert.equal(paths.new(), '/cantos/nuevo');
        assert.deepEqual(matchRoute('/cantos/nuevo', ''), { name: 'new' });
    });

    it('ignores a part or list that is not valid, and keeps the title', () => {
        assert.deepEqual(matchRoute('/cantos/nuevo', '?listado=../x&parte=ENTRADA&titulo=Hola'), { name: 'new', title: 'Hola' });
    });

    it('goes back to the picker instead of the library', () => {
        assert.deepEqual(parentOf({ name: 'new', into }), { path: paths.addToSetlist(ID, 'entrada'), label: 'Volver a agregar' });
        assert.deepEqual(parentOf({ name: 'new' }), { path: paths.list(), label: 'Cantos' });
    });
});

describe('editing a song from singing', () => {
    const back = `/listados/${ID}/cantar/2`;

    it('carries where to come back to', () => {
        const path = paths.edit(ID, back);
        const [pathname, search] = path.split('?');
        assert.deepEqual(matchRoute(pathname ?? '', `?${search ?? ''}`), { name: 'edit', id: ID, back });
        assert.deepEqual(matchRoute(paths.edit(ID)), { name: 'edit', id: ID });
    });

    it('follows nothing but a song being sung', () => {
        for (const wrong of ['https://example.com/', '//example.com', '/ajustes', `/listados/${ID}`, `/listados/${ID}/cantar/x`, 'javascript:alert(1)']) {
            assert.deepEqual(matchRoute(`/cantos/${ID}/editar`, `?volver=${encodeURIComponent(wrong)}`), { name: 'edit', id: ID }, wrong);
        }
    });

    it('goes back to the song being sung', () => {
        assert.deepEqual(parentOf({ name: 'edit', id: ID, back }), { path: back, label: 'Volver a cantar' });
        assert.deepEqual(parentOf({ name: 'edit', id: ID }), { path: paths.view(ID), label: 'Canto' });
    });
});

describe('a shared list', () => {
    const code = '0123456789abcdef0123456789abcdef';

    it('is read at its code, and at a song of it, with no account', () => {
        assert.deepEqual(matchRoute(`/c/${code}`), { name: 'shared', code });
        assert.deepEqual(matchRoute(`/c/${code}/3`), { name: 'shared', code, n: 3 });
        assert.deepEqual(matchRoute(`/c/${code}/`), { name: 'shared', code });
    });

    it('builds addresses it can read back', () => {
        assert.deepEqual(matchRoute(paths.shared(code)), { name: 'shared', code });
        assert.deepEqual(matchRoute(paths.shared(code, 12)), { name: 'shared', code, n: 12 });
    });

    it('refuses a code that is not one and anything after the number', () => {
        for (const wrong of ['/c', '/c/', '/c/abc', `/c/${code.toUpperCase()}`, `/c/${code}x`, `/c/${code}/0x`, `/c/${code}/1/2`, `/c/${code}/1234`]) {
            assert.equal(matchRoute(wrong).name, 'not-found', wrong);
        }
    });
});
