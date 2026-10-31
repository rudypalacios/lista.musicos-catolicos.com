/**
 * What every LocalStore must do. Run against the Map store and against IndexedDB (a fake one
 * in Node, the real one in the browser test), so they cannot drift apart. Songs and setlists
 * are two collections with the same rules, so the same tests run for each.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { LocalStore } from '../../src/data/store.ts';
import type { Collection, Records, Setlist, Song } from '../../src/data/types.ts';

export function song(id: string, at: number, extra: Partial<Song> = {}): Song {
    return { id, title: `Canto ${id}`, author: '', body: `[G]${id}`, myShift: 0, updatedAt: at, deletedAt: null, ...extra };
}

export function setlist(id: string, at: number, extra: Partial<Setlist> = {}): Setlist {
    return {
        id,
        title: `Listado ${id}`,
        eventDate: '2026-11-01',
        notes: '',
        parts: [{ id: 'entrada', name: 'Canto de entrada' }],
        starred: false,
        items: [{ id: `item-${id}`, part: 'entrada', songId: 'a-song', transpose: 2, note: 'Dos veces' }],
        updatedAt: at,
        deletedAt: null,
        ...extra,
    };
}

/** How to make and edit the records of one collection */
interface Kind<C extends Collection> {
    collection: C;
    make(id: string, at: number, extra?: Partial<Records[C]>): Records[C];
    /** What a deletion clears besides `deletedAt` */
    cleared: Partial<Records[C]>;
}

const SONGS: Kind<'songs'> = { collection: 'songs', make: song, cleared: { body: '' } };
const SETLISTS: Kind<'setlists'> = { collection: 'setlists', make: setlist, cleared: { items: [] } };

function describeCollection<C extends Collection>(kind: Kind<C>, create: () => Promise<LocalStore>): void {
    const { collection, make } = kind;

    describe(`${collection}`, () => {
        let store: LocalStore;
        beforeEach(async () => {
            store = await create();
        });

        it('starts empty', async () => {
            assert.deepEqual(await store.all(collection), []);
            assert.deepEqual(await store.pending(collection), []);
        });

        it('saves a record and queues it', async () => {
            await store.save(collection, make('a', 10));

            assert.deepEqual(await store.get(collection, 'a'), make('a', 10));
            assert.deepEqual(await store.pending(collection), [make('a', 10)]);
        });

        it('keeps only the latest queued copy of a record', async () => {
            await store.save(collection, make('a', 10));
            await store.save(collection, make('a', 20, { title: 'Editado' } as Partial<Records[C]>));

            assert.deepEqual(await store.pending(collection), [make('a', 20, { title: 'Editado' } as Partial<Records[C]>)]);
        });

        it('returns undefined for an unknown record', async () => {
            assert.equal(await store.get(collection, 'nope'), undefined);
        });

        it('forgets what was sent, but not an edit made after it', async () => {
            await store.save(collection, make('a', 10));
            await store.save(collection, make('b', 10));
            const sent = [make('a', 10), make('b', 10)];
            await store.save(collection, make('b', 30)); // edited while the push was on its way

            await store.clearPending(collection, sent);

            assert.deepEqual(await store.pending(collection), [make('b', 30)]);
        });

        it('takes records from the server and does not send them back', async () => {
            await store.mergeRemote(pageOf(collection, [make('a', 10), make('b', 20)]), 7);

            assert.equal((await store.all(collection)).length, 2);
            assert.deepEqual(await store.pending(collection), []);
        });

        it('takes a newer server version over an older local one', async () => {
            await store.mergeRemote(pageOf(collection, [make('a', 10)]), 1);
            await store.mergeRemote(pageOf(collection, [make('a', 20, { title: 'Del servidor' } as Partial<Records[C]>)]), 2);

            assert.equal(((await store.get(collection, 'a')) as { title: string }).title, 'Del servidor');
        });

        it('keeps a newer local edit that has not been sent', async () => {
            await store.save(collection, make('a', 50, { title: 'Mi edición' } as Partial<Records[C]>));

            await store.mergeRemote(pageOf(collection, [make('a', 20, { title: 'Viejo del servidor' } as Partial<Records[C]>)]), 3);

            assert.equal(((await store.get(collection, 'a')) as { title: string }).title, 'Mi edición');
            assert.deepEqual(await store.pending(collection), [make('a', 50, { title: 'Mi edición' } as Partial<Records[C]>)]);
        });

        it('drops the queued copy when the server holds a newer one', async () => {
            await store.save(collection, make('a', 10, { title: 'Mío, viejo' } as Partial<Records[C]>));

            await store.mergeRemote(pageOf(collection, [make('a', 90, { title: 'Del servidor, nuevo' } as Partial<Records[C]>)]), 4);

            assert.equal(((await store.get(collection, 'a')) as { title: string }).title, 'Del servidor, nuevo');
            assert.deepEqual(await store.pending(collection), []);
        });

        it('learns about a deletion made elsewhere', async () => {
            await store.mergeRemote(pageOf(collection, [make('a', 10)]), 1);

            await store.mergeRemote(pageOf(collection, [make('a', 20, { ...kind.cleared, deletedAt: 20 })]), 2);

            assert.equal((await store.get(collection, 'a'))?.deletedAt, 20);
        });
    });
}

/** A page from the server holding records of one collection only */
function pageOf<C extends Collection>(collection: C, records: Records[C][]): { songs: Song[]; setlists: Setlist[] } {
    return { songs: [], setlists: [], [collection]: records };
}

export function describeStore(name: string, create: () => Promise<LocalStore>): void {
    describe(`${name} (store contract)`, () => {
        let store: LocalStore;
        beforeEach(async () => {
            store = await create();
        });

        describeCollection(SONGS, create);
        describeCollection(SETLISTS, create);

        it('starts with no cursor and no owner', async () => {
            assert.equal(await store.cursor(), 0);
            assert.equal(await store.owner(), null);
        });

        it('keeps songs and setlists apart, even with the same id', async () => {
            await store.save('songs', song('x', 10));
            await store.save('setlists', setlist('x', 20));

            assert.equal((await store.get('songs', 'x'))?.updatedAt, 10);
            assert.equal((await store.get('setlists', 'x'))?.updatedAt, 20);
            assert.equal((await store.all('songs')).length, 1);
            assert.equal((await store.pending('setlists')).length, 1);
        });

        it('takes songs and setlists from one page and moves one cursor', async () => {
            await store.mergeRemote({ songs: [song('a', 10)], setlists: [setlist('l', 11)] }, 7);

            assert.equal((await store.all('songs')).length, 1);
            assert.equal((await store.all('setlists')).length, 1);
            assert.equal(await store.cursor(), 7);
        });

        it('never moves the cursor backwards', async () => {
            await store.mergeRemote({ songs: [], setlists: [] }, 9);
            await store.mergeRemote({ songs: [], setlists: [] }, 4);

            assert.equal(await store.cursor(), 9);
        });

        it('remembers its owner', async () => {
            await store.setOwner('a@b.co');

            assert.equal(await store.owner(), 'a@b.co');
        });

        it('forgets everything on clear', async () => {
            await store.save('songs', song('a', 10));
            await store.save('setlists', setlist('l', 10));
            await store.mergeRemote({ songs: [], setlists: [] }, 5);
            await store.setOwner('a@b.co');

            await store.clear();

            for (const collection of ['songs', 'setlists'] as const) {
                assert.deepEqual(await store.all(collection), []);
                assert.deepEqual(await store.pending(collection), []);
            }
            assert.equal(await store.cursor(), 0);
            assert.equal(await store.owner(), null);
        });
    });
}
