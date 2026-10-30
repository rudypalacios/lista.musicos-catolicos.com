/**
 * The draft of "Nuevo canto": what the person had written when they left without saving (a touch on the
 * menu, the back arrow, the app closed). One per device, the last, only for a song that does not exist yet;
 * it is never sent to the server. Saving the song or pressing "Cancelar" clears it.
 */

/** What is written in the form of a new song */
export interface Draft {
    title: string;
    author: string;
    body: string;
    /** When it was last kept (ms since the epoch) */
    savedAt: number;
}

/** The part of `localStorage` this needs, so a test can give it a plain object */
export interface DraftStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const STORAGE_KEY = 'lista:borrador-canto';

const isDraft = (value: unknown): value is Draft => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const draft = value as Record<string, unknown>;

    return typeof draft['title'] === 'string' && typeof draft['author'] === 'string'
        && typeof draft['body'] === 'string' && typeof draft['savedAt'] === 'number';
};

export class NewSongDraft {
    private readonly storage: DraftStorage | null;
    private readonly now: () => number;

    constructor(storage: DraftStorage | null, now: () => number = Date.now) {
        this.storage = storage;
        this.now = now;
    }

    /** The draft kept, or null when there is none (or what is stored is not a draft) */
    load(): Draft | null {
        let raw: string | null = null;
        try {
            raw = this.storage?.getItem(STORAGE_KEY) ?? null;
        } catch {
            // Storage blocked (private mode): there is no draft to recover
            return null;
        }
        if (raw === null) {
            return null;
        }
        try {
            const parsed: unknown = JSON.parse(raw);

            return isDraft(parsed) && !isBlank(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }

    /** Keeps what is written. A form with nothing in it is no draft: it clears the old one instead */
    keep(fields: { title: string; author: string; body: string }): void {
        if (isBlank(fields)) {
            this.clear();

            return;
        }
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify({ ...fields, savedAt: this.now() }));
        } catch {
            // Storage blocked or full: the person keeps writing, only the recovery is lost
        }
    }

    clear(): void {
        try {
            this.storage?.removeItem(STORAGE_KEY);
        } catch {
            // Storage blocked: nothing was kept
        }
    }
}

function isBlank(fields: { title: string; author: string; body: string }): boolean {
    return fields.title.trim() === '' && fields.author.trim() === '' && fields.body.trim() === '';
}

/** The device's own draft */
export const newSongDraft = new NewSongDraft((() => {
    try {
        return localStorage;
    } catch {
        return null;
    }
})());
