import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchRoute, paths, sectionOf } from '../src/router.ts';

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
        assert.equal(sectionOf(matchRoute('/ajustes')), null);
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
