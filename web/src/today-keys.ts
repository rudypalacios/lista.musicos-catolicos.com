/**
 * The key a song is sung in "just for today": a change made while rehearsing or singing that was not
 * saved to the list. It lives on this device only (never synced, so the list is untouched), survives
 * a reload in the middle of a Mass, and expires by itself the next morning.
 */

/** The hour (local time) a key of today stops being today's: late enough for a night Mass, before the next day starts */
const EXPIRES_AT_HOUR = 5;

/** The part of `localStorage` this needs, so a test can give it a plain object */
export interface KeyStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface Stored {
    /** Semitones from the song's own key (−11…11) */
    shift: number;
    /** When it stops counting (ms since the epoch) */
    until: number;
}

const STORAGE_KEY = 'lista:tono-hoy';

/** The first `EXPIRES_AT_HOUR` o'clock after `now`, in the device's time zone */
export function expiryAfter(now: number): number {
    const at = new Date(now);
    at.setHours(EXPIRES_AT_HOUR, 0, 0, 0);
    if (at.getTime() <= now) {
        at.setDate(at.getDate() + 1);
    }

    return at.getTime();
}

const isStored = (value: unknown): value is Stored =>
    typeof value === 'object' && value !== null
    && Number.isInteger((value as Stored).shift) && Math.abs((value as Stored).shift) <= 11
    && Number.isFinite((value as Stored).until);

export class TodayKeys {
    private readonly storage: KeyStorage | null;
    private readonly now: () => number;

    constructor(storage: KeyStorage | null, now: () => number = Date.now) {
        this.storage = storage;
        this.now = now;
    }

    /** The key of today for this use of a song in a list, or null when there is none */
    get(setlistId: string, itemId: string): number | null {
        return this.read()[this.id(setlistId, itemId)]?.shift ?? null;
    }

    /** Every key of today in one list, by item */
    ofList(setlistId: string): Map<string, number> {
        const prefix = `${setlistId}/`;

        return new Map(Object.entries(this.read())
            .filter(([id]) => id.startsWith(prefix))
            .map(([id, stored]) => [id.slice(prefix.length), stored.shift]));
    }

    /** Sets it (the key is kept until the next morning, not extended by later changes) */
    set(setlistId: string, itemId: string, shift: number): void {
        const all = this.read();
        const id = this.id(setlistId, itemId);
        all[id] = { shift, until: all[id]?.until ?? expiryAfter(this.now()) };
        this.write(all);
    }

    clear(setlistId: string, itemId: string): void {
        const all = this.read();
        delete all[this.id(setlistId, itemId)];
        this.write(all);
    }

    private id(setlistId: string, itemId: string): string {
        return `${setlistId}/${itemId}`;
    }

    /** What is stored and still counts: expired and malformed entries are dropped */
    private read(): Record<string, Stored> {
        let parsed: unknown = this.fallback;
        try {
            const text = this.storage?.getItem(STORAGE_KEY);
            if (text !== undefined) {
                parsed = text === null ? null : JSON.parse(text);
            }
        } catch {
            // Storage blocked or damaged: only what was set during this visit counts
        }
        const alive: Record<string, Stored> = {};
        if (typeof parsed === 'object' && parsed !== null) {
            for (const [id, stored] of Object.entries(parsed)) {
                if (isStored(stored) && stored.until > this.now()) {
                    alive[id] = stored;
                }
            }
        }

        return alive;
    }

    private write(all: Record<string, Stored>): void {
        this.fallback = all;
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch {
            // Storage blocked (private mode): the key lasts while this page is open
        }
    }

    /** The keys of this visit, for a device whose storage refuses them */
    private fallback: Record<string, Stored> | null = null;
}

/** The device's own store of keys of today */
export const todayKeys = new TodayKeys((() => {
    try {
        return localStorage;
    } catch {
        return null;
    }
})());
