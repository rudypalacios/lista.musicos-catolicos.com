import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchRoute, paths } from '../src/router.ts';

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
});
