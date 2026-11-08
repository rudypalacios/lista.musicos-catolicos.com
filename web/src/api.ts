/** Thin client for the JSON API (src/Http). Every failure is an ApiError the UI can tell apart. */
import type { ErrorKinds } from './data/sync.ts';
import type { ShareState } from './share.ts';
import type { SharedList } from './shared-model.ts';
import type { Collection, Pulled, Pushed, Records, Remote, Setlist, Song, Stamped, Template } from './data/types.ts';

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
    /** Whether the address was confirmed (a link sent to it was opened) */
    verified?: boolean;
}

/** The proof of work the server asks for before a sign-up or a reset (`src/Security/ProofOfWork.php`) */
export interface Proof {
    challenge: string;
    nonce: string;
}

/** What a pull sends: the records as stored, plus the server's own counter, which the app does not keep */
interface PulledPage {
    songs: (Song & { seq?: number })[];
    setlists: (Setlist & { seq?: number })[];
    templates: (Template & { seq?: number })[];
    cursor: number;
    hasMore: boolean;
}

const pickSong = ({ id, title, author, body, tags, myShift, status, updatedAt, deletedAt }: Song): Song => ({
    id, title, author, body, tags: Array.isArray(tags) ? tags : [], myShift, status: status === 'draft' ? 'draft' : 'published', updatedAt, deletedAt,
});

const pickSetlist = ({ id, title, eventDate, notes, starred, items, parts, updatedAt, deletedAt }: Setlist): Setlist => ({
    id,
    title,
    eventDate,
    notes,
    starred,
    items: items.map(({ id: itemId, part, songId, transpose, note }) => ({ id: itemId, part, songId, transpose, note })),
    parts: parts.map(({ id: partId, name, off, optional, note }) => ({
        id: partId,
        name,
        ...(off === true ? { off } : {}),
        ...(optional === true ? { optional } : {}),
        ...(note !== undefined ? { note } : {}),
    })),
    updatedAt,
    deletedAt,
});

const pickTemplate = ({ id, name, parts, updatedAt, deletedAt }: Template): Template => ({
    id,
    name,
    parts: parts.map(({ id: partId, name: partName, off, optional, note }) => ({
        id: partId,
        name: partName,
        ...(off === true ? { off } : {}),
        ...(optional === true ? { optional } : {}),
        ...(note !== undefined ? { note } : {}),
    })),
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
    challenge: (): Promise<{ challenge: string; bits: number }> => request('GET', '/api/challenge'),
    register: (email: string, password: string, pow: Proof): Promise<{ email: string; mailSent: boolean }> =>
        request('POST', '/api/register', { email, password, pow }),
    /** The link of the confirmation email, opened (needs no session: it is often opened in another browser) */
    verifyEmail: (token: string): Promise<{ email: string }> => request('POST', '/api/verify-email', { token }),
    resendVerification: (): Promise<{ mailSent: boolean }> => request('POST', '/api/verify-email/resend', {}),
    forgot: (email: string, pow: Proof): Promise<unknown> => request('POST', '/api/forgot', { email, pow }),
    resetPassword: (token: string, password: string): Promise<{ email: string }> => request('POST', '/api/reset', { token, password }),
    pull: (since: number): Promise<Pulled> =>
        request<PulledPage>('GET', `/api/sync?since=${since}`).then((page) => ({
            ...page,
            songs: page.songs.map(pickSong),
            setlists: page.setlists.map(pickSetlist),
            templates: page.templates.map(pickTemplate),
        })),
    push: <C extends Collection>(collection: C, records: readonly Records[C][]): Promise<Pushed> =>
        request<Pushed>('POST', '/api/sync', { [collection]: records.map(toWire) }),
};

/** Giving a list out by a link (the person's side: it needs a session) */
export const share = {
    status: (setlistId: string): Promise<ShareState> => request<ShareState>('GET', `/api/lists/${setlistId}/share`),
    /** Shares the list, or changes whether the lyrics and chords go with it (the link stays the same) */
    enable: (setlistId: string, withLyrics: boolean): Promise<ShareState> =>
        request<ShareState>('PUT', `/api/lists/${setlistId}/share`, { withLyrics }),
    /** Stops sharing: the link stops working for good */
    stop: (setlistId: string): Promise<ShareState> => request<ShareState>('DELETE', `/api/lists/${setlistId}/share`, {}),
};

/** Giving one song out by a link: the same as a list's, except that its lyrics and chords always go with it */
export const songShare = {
    status: (songId: string): Promise<ShareState> => request<ShareState>('GET', `/api/songs/${songId}/share`),
    enable: (songId: string): Promise<ShareState> => request<ShareState>('PUT', `/api/songs/${songId}/share`, {}),
    stop: (songId: string): Promise<ShareState> => request<ShareState>('DELETE', `/api/songs/${songId}/share`, {}),
};

/** What a link shows, for anyone: no session */
export const readShared = (code: string): Promise<SharedList> => request<SharedList>('GET', `/api/shared/${code}`);

/** The server, as the sync engine sees it */
export const remote: Remote = { pull: api.pull, push: api.push };

/** How the sync engine tells the failures of the API apart */
export const errorKinds: ErrorKinds = {
    isOffline: (error) => error instanceof ApiError && error.isOffline,
    isSignedOut: (error) => error instanceof ApiError && error.status === 401,
    isRefusal: (error) => error instanceof ApiError && error.status === 400,
};
