import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ValidationError } from '../../src/data/library.ts';
import { MemoryStore } from '../../src/data/memory-store.ts';
import {
    BLANK_NAME, blankSections, byName, copyName, lastUsedFirst, MISA_ID, Templates,
} from '../../src/data/templates.ts';
import { LIMITS, type PartDef, type Template } from '../../src/data/types.ts';
import { massSections } from '../../src/mass.ts';
import { template } from './store.contract.ts';

describe('Templates', () => {
    let store: MemoryStore;
    let now: number;
    let ids: number;
    let writes: number;
    let templates: Templates;
    beforeEach(() => {
        store = new MemoryStore();
        now = 1_000;
        ids = 0;
        writes = 0;
        templates = new Templates(store, () => writes++, () => now, () => `id-${ids++}`);
    });

    const own: PartDef[] = [{ id: 'p-uno', name: 'Primer misterio' }, { id: 'p-dos', name: 'Segundo misterio' }];

    describe('the Misa', () => {
        it('is made once, with the sections of the Mass and a fixed id, and queued', async () => {
            assert.equal(await templates.ensureMisa(), true);

            const [misa] = await templates.list();
            assert.equal(misa?.id, MISA_ID);
            assert.equal(misa?.name, 'Misa');
            assert.deepEqual(misa?.parts, massSections());
            assert.equal((await store.pending('templates')).length, 1);
            assert.equal(writes, 1);
        });

        it('is not made again, nor does a deleted one come back', async () => {
            await templates.ensureMisa();
            assert.equal(await templates.ensureMisa(), false);

            now += 10;
            await templates.remove(MISA_ID);

            assert.equal(await templates.ensureMisa(), false);
            assert.deepEqual(await templates.list(), []);
        });

        it('is not made where the server already sent one', async () => {
            await store.mergeRemote({ songs: [], setlists: [], templates: [template(MISA_ID, 5, { name: 'Misa del domingo' })] }, 1);

            assert.equal(await templates.ensureMisa(), false);
            assert.deepEqual((await templates.list()).map((t) => t.name), ['Misa del domingo']);
        });
    });

    describe('making', () => {
        it('keeps a copy of the sections, without the ones switched off, and the name trimmed', async () => {
            const made = await templates.create('  Rosario ', [...own, { id: 'p-tres', name: 'Apagada', off: true }]);

            assert.equal(made.name, 'Rosario');
            assert.deepEqual(made.parts, own);
            assert.equal(made.deletedAt, null);
            assert.deepEqual(await store.pending('templates'), [made]);
        });

        it('refuses a template with no name, a name too long, no sections or only switched-off ones', async () => {
            await assert.rejects(templates.create('  ', own), /necesita un nombre/);
            await assert.rejects(templates.create('x'.repeat(LIMITS.templateName + 1), own), /demasiado largo/);
            await assert.rejects(templates.create('Vacía', []), /al menos una sección/);
            await assert.rejects(templates.create('Apagada', [{ id: 'a', name: 'A', off: true }]), /al menos una sección/);
            assert.equal((await templates.list()).length, 0, 'nothing was saved');
        });

        it('stops at the limit of templates', async () => {
            for (let i = 0; i < LIMITS.templates; i++) {
                await templates.create(`Plantilla ${i}`, own);
            }

            await assert.rejects(templates.create('Una más', own), /hasta 20 plantillas/);
            await assert.rejects(templates.duplicate((await templates.list())[0]?.id ?? ''), /hasta 20 plantillas/);
        });

        it('takes the sections of a list, the ones it shows', async () => {
            const made = await templates.fromList('Del listado', { parts: [...own, { id: 'p-tres', name: 'Oculta', off: true }] });

            assert.deepEqual(made.parts.map((part) => part.id), ['p-uno', 'p-dos']);
        });
    });

    describe('changing', () => {
        it('renames, and refuses an empty name', async () => {
            const made = await templates.create('Rosario', own);
            now += 10;

            assert.equal((await templates.rename(made.id, ' Rosario del jueves ')).name, 'Rosario del jueves');
            await assert.rejects(templates.rename(made.id, ''), ValidationError);
        });

        it('adds, renames, moves and deletes sections like a list does, and keeps at least one', async () => {
            const made = await templates.create('Rosario', own);
            now += 10;

            const added = await templates.addPart(made.id, ' Tercer misterio ');
            assert.equal(added.parts.at(-1)?.name, 'Tercer misterio');
            assert.match(added.parts.at(-1)?.id ?? '', /^p-[a-z0-9]{1,8}$/);

            assert.equal((await templates.renamePart(made.id, 'p-uno', 'Gozoso')).parts[0]?.name, 'Gozoso');
            assert.deepEqual((await templates.movePart(made.id, 'p-dos', -1)).parts.slice(0, 2).map((p) => p.id), ['p-dos', 'p-uno']);
            await templates.removePart(made.id, 'p-dos');
            await templates.removePart(made.id, 'p-uno');
            await assert.rejects(templates.removePart(made.id, added.parts.at(-1)?.id ?? ''), /al menos una sección/);
            assert.equal((await templates.get(made.id))?.parts.length, 1);
        });

        it('offers a section of the Mass back with its own id, once', async () => {
            const made = await templates.create('Rosario', own);
            const gloria = massSections().find((part) => part.id === 'gloria');

            const added = await templates.addPart(made.id, 'Gloria', gloria);

            assert.equal(added.parts.at(-1)?.id, 'gloria');
            await assert.rejects(templates.addPart(made.id, 'Gloria', gloria), /mismo identificador/);
        });

        it('duplicates as "Copia de …" with the same sections, and a copy of a copy keeps one prefix', async () => {
            const made = await templates.create('Rosario', own);

            const copy = await templates.duplicate(made.id);
            const again = await templates.duplicate(copy.id);

            assert.equal(copy.name, 'Copia de Rosario');
            assert.equal(again.name, 'Copia de Rosario');
            assert.deepEqual(copy.parts, own);
            assert.notEqual(copy.id, made.id);
        });

        it('deletes, and a deleted template is neither listed nor found nor changed', async () => {
            const made = await templates.create('Rosario', own);
            now += 10;

            await templates.remove(made.id);

            assert.deepEqual(await templates.list(), []);
            assert.equal(await templates.get(made.id), undefined);
            await assert.rejects(templates.rename(made.id, 'Otro'), /ya no existe/);
            const queued = await store.pending('templates');
            assert.equal(queued[0]?.deletedAt, queued[0]?.updatedAt);
        });

        it('stamps each change strictly after the one it replaces, even with a clock that stood still', async () => {
            const made = await templates.create('Rosario', own);

            const next = await templates.rename(made.id, 'Rosario 2');

            assert.ok(next.updatedAt > made.updatedAt);
        });
    });

    describe('reading', () => {
        const a = (name: string): Template => template(name, 1, { name });

        it('orders by name, accents and capitals aside', () => {
            assert.deepEqual([a('Rosario'), a('Adoración'), a('misa')].sort(byName).map((t) => t.name), ['Adoración', 'misa', 'Rosario']);
        });

        it('puts the last one used first and the rest by name', () => {
            const all = [a('Misa'), a('Rosario'), a('Adoración')];

            assert.deepEqual(lastUsedFirst(all, 'Rosario').map((t) => t.name), ['Rosario', 'Adoración', 'Misa']);
            assert.deepEqual(lastUsedFirst(all, null).map((t) => t.name), ['Adoración', 'Misa', 'Rosario']);
            assert.deepEqual(lastUsedFirst(all, 'borrada').map((t) => t.name), ['Adoración', 'Misa', 'Rosario'], 'a template that is gone');
        });

        it('cuts a copy\'s name to the longest a template may have', () => {
            assert.equal(Array.from(copyName('x'.repeat(100))).length, LIMITS.templateName);
        });

        it('makes a blank list one section, "Cantos", with an id of its own', () => {
            assert.equal(BLANK_NAME, 'Listado');
            const [only] = blankSections(() => 'abcd1234-0000');
            assert.deepEqual(only, { id: 'p-abcd1234', name: 'Cantos' });
        });
    });
});
