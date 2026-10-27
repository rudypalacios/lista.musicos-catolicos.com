/** Thin client for the JSON API (src/Http). Every failure is an ApiError the UI can tell apart. */
import type { ErrorKinds } from './data/sync.ts';
import type { Collection, Pulled, Pushed, Records, Remote, Setlist, Song, Stamped } from './data/types.ts';

export class ApiError extends Error {
    /** HTTP status, or 0 when the request never reached the server (offline) */
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
    }

    get isOffline(): boolean {
        return this.status === 0;
    }
}

interface ErrorBody {
    error?: unknown;
    message?: unknown;
}

/** A request that has not answered by now is treated as no connection: a stuck network must not freeze the app */
const TIMEOUT_MS = 15000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    let data: unknown;
    try {
        response = await fetch(path, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin',
            signal: controller.signal,
        });
        data = await response.json().catch(() => ({}));
    } catch {
        throw new ApiError(0, 'offline', 'Sin conexión.');
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        const { error, message } = data as ErrorBody;
        throw new ApiError(
            response.status,
            typeof error === 'string' ? error : 'server_error',
            typeof message === 'string' ? message : 'Algo salió mal. Inténtalo de nuevo.',
        );
    }

    return data as T;
}

export interface Me {
    email: string;
}

/** What a pull sends: the records as stored, plus the server's own counter, which the app does not keep */
interface PulledPage {
    songs: (Song & { seq?: number })[];
    setlists: (Setlist & { seq?: number })[];
    cursor: number;
    hasMore: boolean;
}

const pickSong = ({ id, title, author, body, updatedAt, deletedAt }: Song): Song => ({
    id, title, author, body, updatedAt, deletedAt,
});

const pickSetlist = ({ id, title, eventDate, notes, items, updatedAt, deletedAt }: Setlist): Setlist => ({
    id,
    title,
    eventDate,
    notes,
    items: items.map(({ id: itemId, part, songId, transpose, note }) => ({ id: itemId, part, songId, transpose, note })),
    updatedAt,
    deletedAt,
});

/** A record as the server takes it: `deletedAt` becomes the `deleted` flag */
function toWire(record: Stamped): object {
    const { deletedAt, ...rest } = record;

    return { ...rest, deleted: deletedAt !== null };
}

export const api = {
    me: (): Promise<Me> => request<Me>('GET', '/api/me'),
    login: (email: string, password: string): Promise<Me> => request<Me>('POST', '/api/login', { email, password }),
    logout: (): Promise<unknown> => request('POST', '/api/logout', {}),
    pull: (since: number): Promise<Pulled> =>
        request<PulledPage>('GET', `/api/sync?since=${since}`).then((page) => ({
            ...page,
            songs: page.songs.map(pickSong),
            // A server from before setlists answers with songs only
            setlists: (page.setlists ?? []).map(pickSetlist),
        })),
    push: <C extends Collection>(collection: C, records: readonly Records[C][]): Promise<Pushed> =>
        request<Pushed>('POST', '/api/sync', { [collection]: records.map(toWire) }),
};

/** The server, as the sync engine sees it */
export const remote: Remote = { pull: api.pull, push: api.push };

/** How the sync engine tells the failures of the API apart */
export const errorKinds: ErrorKinds = {
    isOffline: (error) => error instanceof ApiError && error.isOffline,
    isSignedOut: (error) => error instanceof ApiError && error.status === 401,
    isRefusal: (error) => error instanceof ApiError && error.status === 400,
};
