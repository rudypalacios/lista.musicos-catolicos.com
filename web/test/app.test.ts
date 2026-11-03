import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App, signOut } from '../src/app.ts';
import { MISA_ID } from '../src/data/templates.ts';
import { GUEST_OWNER } from '../src/guest.ts';

// In Node there is no IndexedDB, so App falls back to its in-memory store (as an old browser would)
const draft = (title: string) => ({ title, author: '', body: '[G]Letra' });

describe('App', () => {
    it('falls back to memory without IndexedDB and says nothing will survive a reload', async () => {
        const app = await App.create();

        assert.equal(app.status().durable, false);
    });

    it('keeps the songs of the same account across sign-ins', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.create(draft('Mío'));

        await app.adopt('a@example.com');

        assert.deepEqual((await app.list()).map((s) => s.title), ['Mío']);
        assert.equal(await app.owner(), 'a@example.com');
    });

    it('removes the songs of another account before a different one signs in', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.create(draft('De A'));
        await app.create(draft('Otro de A'));

        await app.adopt('b@example.com');

        assert.deepEqual(await app.list(), []);
        assert.equal(await app.unsent(), 0, 'and nothing of A is left to be sent as B');
        assert.equal(await app.owner(), 'b@example.com');
    });

    it('counts what was written here and not sent', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');

        await app.create(draft('Uno'));
        await app.create(draft('Dos'));

        assert.equal(await app.unsent(), 2);
        assert.equal(app.status().pending, 2);
    });

    it('does not sign out when the person refuses to lose unsent songs', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.create(draft('Sin enviar'));
        let asked = 0;

        const done = await signOut(app, (unsent) => {
            asked = unsent;

            return false;
        });

        assert.equal(done, false);
        assert.equal(asked, 1);
        assert.deepEqual((await app.list()).map((s) => s.title), ['Sin enviar']);
    });

    it('wipes the device when signing out is confirmed', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.create(draft('Se borra'));

        const done = await signOut(app, () => true);

        assert.equal(done, true);
        assert.deepEqual(await app.list(), []);
        assert.equal(await app.owner(), null);
    });

    it('tells listeners when the songs change', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        let changes = 0;
        app.onData(() => changes++);

        await app.create(draft('Nuevo'));

        assert.ok(changes >= 1);
    });

    it('counts unsent lists with unsent songs, and warns before a sign-out loses them', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.create(draft('Un canto'));
        await app.setlists.create({ title: 'Una lista' });
        let asked = 0;

        assert.equal(await app.unsent(), 2);
        assert.equal(app.status().pending, 2);
        const done = await signOut(app, (unsent) => {
            asked = unsent;

            return false;
        });

        assert.equal(done, false);
        assert.equal(asked, 2);
        assert.equal((await app.setlists.list()).length, 1);
    });

    it('removes the lists of another account before a different one signs in', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.setlists.create({ title: 'De A' });

        await app.adopt('b@example.com');

        assert.deepEqual(await app.setlists.list(), []);
        assert.equal(await app.unsent(), 0);
    });

    it('tells listeners and the status when a list is written', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        let changes = 0;
        app.onData(() => changes++);

        const list = await app.setlists.create({ title: 'Nueva' });
        await app.setlists.update(list.id, { title: 'Editada', eventDate: null, notes: '' });
        await new Promise((resolve) => setTimeout(resolve, 20));

        assert.ok(changes >= 2);
        assert.equal(app.status().pending, 1, 'one list waiting, whatever the number of edits');
    });

    it('wipes the lists when signing out is confirmed', async () => {
        const app = await App.create();
        await app.adopt('a@example.com');
        await app.setlists.create({ title: 'Se borra' });

        await signOut(app, () => true);

        assert.deepEqual(await app.setlists.list(), []);
    });

    describe('with no account', () => {
        it('opens for a device with nothing on it, belongs to no account and has the Mass', async () => {
            const app = await App.create();

            await app.startGuest();

            assert.equal(await app.owner(), GUEST_OWNER);
            assert.equal(app.isGuest(), true);
            assert.equal(app.status().guest, true);
            assert.equal(app.status().state, 'local');
            assert.deepEqual((await app.templates.list()).map((template) => template.id), [MISA_ID]);
        });

        it('keeps what is written and never syncs it', async () => {
            const app = await App.create();
            await app.startGuest();

            await app.create(draft('Probando'));
            await app.syncNow();
            app.requestSync(0);

            assert.deepEqual((await app.list()).map((song) => song.title), ['Probando']);
            assert.equal(app.status().state, 'local', 'there is nobody to sync with: it neither runs nor fails');
            assert.equal(await app.unsent(), 2, 'the song and the Mass wait for the day the person signs in');
        });

        it('counts what the person wrote, not the Mass every device makes', async () => {
            const app = await App.create();
            await app.startGuest();
            assert.deepEqual(await app.guestWork(), { songs: 0, lists: 0, templates: 0 });

            await app.create(draft('Uno'));
            await app.create(draft('Dos'));
            await app.setlists.create();
            await app.templates.create('Rosario', [{ id: 'a', name: 'Misterios' }]);

            assert.deepEqual(await app.guestWork(), { songs: 2, lists: 1, templates: 1 });
        });

        it('signs in and keeps what was written: it stays on the device, owned by the account, and waits to be sent', async () => {
            const app = await App.create();
            await app.startGuest();
            await app.create(draft('Mío'));

            await app.adoptKeepingGuestWork('a@example.com');

            assert.equal(await app.owner(), 'a@example.com');
            assert.equal(app.isGuest(), false);
            assert.deepEqual((await app.list()).map((song) => song.title), ['Mío']);
            assert.equal(await app.unsent(), 2, 'it is all still to be sent');
        });

        it('gives way to the account\'s Mass: the one made with no account is stamped as the oldest', async () => {
            const app = await App.create();
            await app.startGuest();

            await app.adoptKeepingGuestWork('a@example.com');

            assert.equal((await app.templates.get(MISA_ID))?.updatedAt, 0);
        });

        it('signs in and drops what was written when that is the choice', async () => {
            const app = await App.create();
            await app.startGuest();
            await app.create(draft('Descartado'));

            await app.adopt('a@example.com');

            assert.deepEqual(await app.list(), []);
            assert.equal(await app.unsent(), 0);
            assert.equal(await app.owner(), 'a@example.com');
            assert.equal(app.isGuest(), false);
        });

        it('keeps what an earlier visit wrote when the app opens again', async () => {
            const app = await App.create();
            await app.startGuest();
            await app.create(draft('De ayer'));

            await app.startGuest();

            assert.deepEqual((await app.list()).map((song) => song.title), ['De ayer']);
            assert.equal(await app.owner(), GUEST_OWNER);
        });

        it('refuses to keep what a device holds if it was not used with no account', async () => {
            const app = await App.create();
            await app.adopt('a@example.com');

            await assert.rejects(app.adoptKeepingGuestWork('b@example.com'));
        });
    });
});
