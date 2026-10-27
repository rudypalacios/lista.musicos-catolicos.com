import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Library } from '../../src/data/library.ts';
import { MemoryStore } from '../../src/data/memory-store.ts';
import { SyncEngine, SyncStopped } from '../../src/data/sync.ts';
import { FAKE_ERRORS, FakeServer } from './fake-server.ts';

/** A device: its own store and library, talking to the shared server */
function device(server: FakeServer, clock: { now: number }) {
    const store = new MemoryStore();
    let n = 0;
    const library = new Library(store, () => clock.now, () => `dev-${Math.random().toString(16).slice(2)}-${n++}`);
    const engine = new SyncEngine(store, server.remote(), FAKE_ERRORS);

    return { store, library, engine };
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
        assert.deepEqual(await phone.store.pending(), []);
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
        assert.deepEqual(await tablet.store.pending(), [], 'what it received is not sent back');
    });

    it('keeps what was written offline until the network is back', async () => {
        const phone = device(server, clock);
        server.online = false;
        await phone.library.create(draft('Escrito en el metro'));

        await assert.rejects(phone.engine.sync(), (e: unknown) => e instanceof SyncStopped && e.reason === 'offline');
        assert.equal((await phone.store.pending()).length, 1);

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
            assert.deepEqual(await d.store.pending(), []);
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

        assert.equal((await phone.store.pending())[0]?.title, 'Durante el envío');

        clock.now = 3_000;
        await phone.engine.sync();

        assert.equal(server.songs()[0]?.title, 'Durante el envío');
        assert.deepEqual(await phone.store.pending(), []);
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
        assert.deepEqual((await phone.store.pending()).map((s) => s.id), [bad.id], 'the bad one stays, marked');
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

        assert.equal((await phone.store.pending()).length, 1);
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
});
