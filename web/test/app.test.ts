import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { App, signOut } from '../src/app.ts';

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
});
