import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Library } from '../../src/data/library.ts';
import { MemoryStore } from '../../src/data/memory-store.ts';
import { Setlists } from '../../src/data/setlists.ts';
import { SyncEngine, SyncStopped } from '../../src/data/sync.ts';
import { Templates } from '../../src/data/templates.ts';
import { FAKE_ERRORS, FakeServer } from './fake-server.ts';

/** A device: its own store and library, talking to the shared server */
function device(server: FakeServer, clock: { now: number }) {
    const store = new MemoryStore();
    let n = 0;
    const newId = (): string => `dev-${Math.random().toString(16).slice(2)}-${n++}`;
    const library = new Library(store, () => clock.now, newId);
    const setlists = new Setlists(store, () => undefined, () => clock.now, newId);
    const templates = new Templates(store, () => undefined, () => clock.now, newId);
    const engine = new SyncEngine(store, server.remote(), FAKE_ERRORS);

    return { store, library, setlists, templates, engine };
}

const draft = (title: string, body = '[G]Letra') => ({ title, author: '', body });

describe('SyncEngine', () => {
    let server: FakeServer;
    let clock: { now: number };
    beforeEach(() => {
        server = new FakeServer();
        clock = { now: 1_000 };
    });

    it('sends a new song and does not send it again', async () => {
        const phone = device(server, clock);
        await phone.library.create(draft('Uno'));

        const first = await phone.engine.sync();
        const second = await phone.engine.sync();

        assert.equal(first.pushed, 1);
        assert.equal(second.pushed, 0);
        assert.deepEqual(await phone.store.pending('songs'), []);
        assert.equal(server.songs().length, 1);
    });

    it('brings the songs of another device', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        await phone.library.create(draft('Del teléfono'));
        await phone.engine.sync();

        const result = await tablet.engine.sync();

        assert.equal(result.pulled, 1);
        assert.deepEqual((await tablet.library.list()).map((s) => s.title), ['Del teléfono']);
        assert.deepEqual(await tablet.store.pending('songs'), [], 'what it received is not sent back');
    });

    it('sends a template, brings it to another device and carries its deletion', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        const made = await phone.templates.create('Rosario', [{ id: 'p-uno', name: 'Misterios' }]);

        assert.equal((await phone.engine.sync()).pushed, 1);
        assert.deepEqual(server.templates().map((template) => template.name), ['Rosario']);
        assert.equal((await tablet.engine.sync()).pulled, 1);
        assert.deepEqual((await tablet.templates.list()).map((template) => template.parts), [[{ id: 'p-uno', name: 'Misterios' }]]);
        assert.deepEqual(await tablet.store.pending('templates'), [], 'what it received is not sent back');

        clock.now += 10;
        await phone.templates.remove(made.id);
        await phone.engine.sync();
        await tablet.engine.sync();
        assert.deepEqual(await tablet.templates.list(), []);
    });

    it('does not make a second Misa on another device that already heard of the first', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        await phone.templates.ensureMisa();
        await phone.engine.sync();

        await tablet.engine.sync();
        const again = await tablet.templates.ensureMisa();

        assert.equal(again, false);
        assert.equal((await tablet.templates.list()).length, 1);
    });

    it('keeps what was written offline until the network is back', async () => {
        const phone = device(server, clock);
        server.online = false;
        await phone.library.create(draft('Escrito en el metro'));

        await assert.rejects(phone.engine.sync(), (e: unknown) => e instanceof SyncStopped && e.reason === 'offline');
        assert.equal((await phone.store.pending('songs')).length, 1);

        server.online = true;
        const result = await phone.engine.sync();

        assert.equal(result.pushed, 1);
        assert.equal(server.songs().length, 1);
    });

    it('lets the newest edit win, whichever device syncs first', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        clock.now = 1_000;
        const song = await phone.library.create(draft('Original'));
        await phone.engine.sync();
        await tablet.engine.sync();

        // The phone edits offline at t=2000; the tablet edits at t=3000 and syncs first
        clock.now = 2_000;
        await phone.library.update(song.id, draft('Edición del teléfono'));
        clock.now = 3_000;
        await tablet.library.update(song.id, draft('Edición de la tablet'));
        await tablet.engine.sync();

        await phone.engine.sync();
        await tablet.engine.sync();

        for (const d of [phone, tablet]) {
            assert.equal((await d.library.get(song.id))?.title, 'Edición de la tablet');
            assert.deepEqual(await d.store.pending('songs'), []);
        }
        assert.equal(server.songs()[0]?.title, 'Edición de la tablet');
    });

    it('does not lose a newer local edit when an older version arrives', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        clock.now = 1_000;
        const song = await tablet.library.create(draft('Original'));
        await tablet.engine.sync();
        await phone.engine.sync();

        clock.now = 2_000;
        await tablet.library.update(song.id, draft('Tablet 2000'));
        await tablet.engine.sync();
        clock.now = 5_000;
        await phone.library.update(song.id, draft('Teléfono 5000')); // newer, not synced yet

        await phone.engine.sync();

        assert.equal((await phone.library.get(song.id))?.title, 'Teléfono 5000');
        assert.equal(server.songs()[0]?.title, 'Teléfono 5000');
    });

    it('spreads a deletion', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        const song = await phone.library.create(draft('Borrar'));
        await phone.engine.sync();
        await tablet.engine.sync();

        clock.now = 5_000;
        await phone.library.remove(song.id);
        await phone.engine.sync();
        await tablet.engine.sync();

        assert.deepEqual(await tablet.library.list(), []);
        assert.equal(await tablet.library.get(song.id), undefined);
    });

    it('does not drop an edit made while a push is on its way', async () => {
        const phone = device(server, clock);
        const song = await phone.library.create(draft('Antes'));
        clock.now = 2_000;
        server.duringPush = async () => {
            await phone.library.update(song.id, draft('Durante el envío'));
        };

        await phone.engine.sync();

        assert.equal((await phone.store.pending('songs'))[0]?.title, 'Durante el envío');

        clock.now = 3_000;
        await phone.engine.sync();

        assert.equal(server.songs()[0]?.title, 'Durante el envío');
        assert.deepEqual(await phone.store.pending('songs'), []);
    });

    it('sends a refused batch song by song so one bad song blocks nobody', async () => {
        const phone = device(server, clock);
        const good1 = await phone.library.create(draft('Bueno 1'));
        const bad = await phone.library.create(draft('Malo'));
        const good2 = await phone.library.create(draft('Bueno 2'));
        server.refuse.add(bad.id);

        const result = await phone.engine.sync();

        assert.deepEqual(result.rejected, [bad.id]);
        assert.equal(result.pushed, 2);
        assert.deepEqual(server.songs().map((s) => s.id).sort(), [good1.id, good2.id].sort());
        assert.deepEqual((await phone.store.pending('songs')).map((s) => s.id), [bad.id], 'the bad one stays, marked');
    });

    it('sends at most 100 songs at a time', async () => {
        const phone = device(server, clock);
        for (let i = 0; i < 230; i++) {
            await phone.library.create(draft(`Canto ${i}`));
        }

        await phone.engine.sync();

        assert.deepEqual(server.pushes, [100, 100, 30]);
        assert.equal(server.songs().length, 230);
    });

    it('pulls page by page until it has everything', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        for (let i = 0; i < 25; i++) {
            await phone.library.create(draft(`Canto ${i}`));
        }
        await phone.engine.sync();
        server.pageSize = 10;

        const result = await tablet.engine.sync();

        assert.equal(result.pulled, 25);
        assert.equal((await tablet.library.list()).length, 25);
        assert.equal(await tablet.store.cursor(), 25);
    });

    it('says when the session ended and keeps the queue', async () => {
        const phone = device(server, clock);
        await phone.library.create(draft('Pendiente'));
        server.signedIn = false;

        await assert.rejects(phone.engine.sync(), (e: unknown) => e instanceof SyncStopped && e.reason === 'signed-out');

        assert.equal((await phone.store.pending('songs')).length, 1);
    });

    it('picks up where it stopped after a network failure in the middle', async () => {
        const phone = device(server, clock);
        const tablet = device(server, clock);
        for (let i = 0; i < 25; i++) {
            await phone.library.create(draft(`Canto ${i}`));
        }
        await phone.engine.sync();
        server.pageSize = 10;
        const remote = server.remote();
        let calls = 0;
        const flaky = new SyncEngine(tablet.store, {
            push: remote.push,
            pull: (since) => (++calls === 2 ? Promise.reject(new Error('boom')) : remote.pull(since)),
        }, { ...FAKE_ERRORS, isOffline: () => false });

        await assert.rejects(flaky.sync(), /boom/);
        assert.equal(await tablet.store.cursor(), 10, 'the cursor covers exactly the songs it received');

        await tablet.engine.sync();

        assert.equal((await tablet.library.list()).length, 25);
    });

    describe('setlists', () => {
        it('sends a new list with its items and does not send it again', async () => {
            const phone = device(server, clock);
            const song = await phone.library.create(draft('Uno'));
            const list = await phone.setlists.create({ title: 'Domingo', eventDate: '2026-11-01' });
            await phone.setlists.addItem(list.id, 'entrada', song.id);

            const first = await phone.engine.sync();
            const second = await phone.engine.sync();

            assert.equal(first.pushed, 2, 'the song and the list');
            assert.equal(second.pushed, 0);
            assert.deepEqual(await phone.store.pending('setlists'), []);
            assert.equal(server.setlists()[0]?.items.length, 1);
        });

        it('brings the lists, with their keys, to another device', async () => {
            const phone = device(server, clock);
            const tablet = device(server, clock);
            const song = await phone.library.create(draft('Uno'));
            const list = await phone.setlists.create();
            const withItem = await phone.setlists.addItem(list.id, 'comunion', song.id);
            await phone.setlists.shiftItem(list.id, withItem.items[0]?.id ?? '', 3);
            await phone.engine.sync();

            const result = await tablet.engine.sync();

            assert.equal(result.pulled, 2);
            const received = await tablet.setlists.get(list.id);
            assert.equal(received?.items[0]?.transpose, 3);
            assert.equal((await tablet.library.get(song.id))?.body, '[G]Letra', 'and the song itself is untouched');
            assert.deepEqual(await tablet.store.pending('setlists'), [], 'what it received is not sent back');
        });

        it('lets the newest edit of a list win, whichever device syncs first', async () => {
            const phone = device(server, clock);
            const tablet = device(server, clock);
            const list = await phone.setlists.create({ title: 'Original', eventDate: null });
            await phone.engine.sync();
            await tablet.engine.sync();

            clock.now = 2_000_000_000_000;
            await phone.setlists.update(list.id, { title: 'Del teléfono', eventDate: null, notes: '' });
            clock.now = 2_000_000_003_000;
            await tablet.setlists.update(list.id, { title: 'De la tablet', eventDate: null, notes: '' });
            await tablet.engine.sync();
            await phone.engine.sync();
            await tablet.engine.sync();

            for (const d of [phone, tablet]) {
                assert.equal((await d.setlists.get(list.id))?.title, 'De la tablet');
            }
        });

        it('spreads the deletion of a list', async () => {
            const phone = device(server, clock);
            const tablet = device(server, clock);
            const list = await phone.setlists.create();
            await phone.engine.sync();
            await tablet.engine.sync();

            clock.now = 5_000_000_000_000;
            await phone.setlists.remove(list.id);
            await phone.engine.sync();
            await tablet.engine.sync();

            assert.deepEqual(await tablet.setlists.list(), []);
        });

        it('keeps a list written offline until the network is back', async () => {
            const phone = device(server, clock);
            server.online = false;
            await phone.setlists.create();

            await assert.rejects(phone.engine.sync(), (e: unknown) => e instanceof SyncStopped && e.reason === 'offline');
            assert.equal((await phone.store.pending('setlists')).length, 1);

            server.online = true;
            const result = await phone.engine.sync();

            assert.equal(result.pushed, 1);
            assert.equal(server.setlists().length, 1);
        });

        it('sends a refused list on its own so it blocks nobody, and says which', async () => {
            const phone = device(server, clock);
            const good = await phone.setlists.create({ title: 'Buena' });
            const bad = await phone.setlists.create({ title: 'Mala' });
            server.refuse.add(bad.id);

            const result = await phone.engine.sync();

            assert.deepEqual(result.rejected, [bad.id]);
            assert.deepEqual(server.setlists().map((l) => l.id), [good.id]);
            assert.deepEqual((await phone.store.pending('setlists')).map((l) => l.id), [bad.id]);
        });

        it('pulls songs and lists page by page through one cursor', async () => {
            const phone = device(server, clock);
            const tablet = device(server, clock);
            for (let i = 0; i < 6; i++) {
                await phone.library.create(draft(`Canto ${i}`));
                await phone.setlists.create({ title: `Misa ${i}`, eventDate: null });
            }
            await phone.engine.sync();
            server.pageSize = 5;

            const result = await tablet.engine.sync();

            assert.equal(result.pulled, 12);
            assert.equal((await tablet.library.list()).length, 6);
            assert.equal((await tablet.setlists.list()).length, 6);
            assert.equal(await tablet.store.cursor(), 12);
        });

        it('does not drop an edit to a list made while its push is on its way', async () => {
            const phone = device(server, clock);
            const list = await phone.setlists.create({ title: 'Antes' });
            clock.now += 2_000;
            server.duringPush = async () => {
                await phone.setlists.update(list.id, { title: 'Durante el envío', eventDate: null, notes: '' });
            };

            await phone.engine.sync();
            assert.equal((await phone.store.pending('setlists'))[0]?.title, 'Durante el envío');

            clock.now += 2_000;
            await phone.engine.sync();

            assert.equal(server.setlists()[0]?.title, 'Durante el envío');
            assert.deepEqual(await phone.store.pending('setlists'), []);
        });
    });
});
