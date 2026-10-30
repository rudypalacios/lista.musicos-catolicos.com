import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NewSongDraft, type DraftStorage } from '../src/song-draft.ts';

const memoryStorage = (): DraftStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();

    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
        removeItem: (key) => void data.delete(key),
    };
};

const FIELDS = { title: 'Caminamos', author: '', body: '[C]Hola' };

describe('NewSongDraft', () => {
    it('gives back what was kept, with when', () => {
        const draft = new NewSongDraft(memoryStorage(), () => 1234);
        draft.keep(FIELDS);
        assert.deepEqual(draft.load(), { ...FIELDS, savedAt: 1234 });
    });

    it('keeps only the last one', () => {
        const draft = new NewSongDraft(memoryStorage());
        draft.keep(FIELDS);
        draft.keep({ ...FIELDS, title: 'Otro' });
        assert.equal(draft.load()?.title, 'Otro');
    });

    it('is cleared by clear', () => {
        const draft = new NewSongDraft(memoryStorage());
        draft.keep(FIELDS);
        draft.clear();
        assert.equal(draft.load(), null);
    });

    it('treats a form with nothing in it as no draft, and drops the old one', () => {
        const storage = memoryStorage();
        const draft = new NewSongDraft(storage);
        draft.keep(FIELDS);
        draft.keep({ title: ' ', author: '', body: '\n' });
        assert.equal(storage.data.size, 0);
        assert.equal(draft.load(), null);
    });

    it('ignores what is stored when it is not a draft', () => {
        const storage = memoryStorage();
        const draft = new NewSongDraft(storage);
        storage.data.set('lista:borrador-canto', 'not json');
        assert.equal(draft.load(), null);
        storage.data.set('lista:borrador-canto', JSON.stringify({ title: 3 }));
        assert.equal(draft.load(), null);
    });

    it('does not break when the storage refuses (private mode)', () => {
        const refusing: DraftStorage = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('blocked');
            },
            removeItem: () => {
                throw new Error('blocked');
            },
        };
        const draft = new NewSongDraft(refusing);
        assert.doesNotThrow(() => draft.keep(FIELDS));
        assert.doesNotThrow(() => draft.clear());
        assert.equal(draft.load(), null);
    });

    it('does nothing without a storage', () => {
        const draft = new NewSongDraft(null);
        draft.keep(FIELDS);
        assert.equal(draft.load(), null);
    });
});
