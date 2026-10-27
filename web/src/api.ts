/** Thin client for the JSON API (src/Http). Every failure is an ApiError the UI can tell apart. */

export class ApiError extends Error {
    constructor(
        /** HTTP status, or 0 when the request never reached the server (offline) */
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    get isOffline(): boolean {
        return this.status === 0;
    }
}

interface ErrorBody {
    error?: unknown;
    message?: unknown;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
        response = await fetch(path, {
            method,
            headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin',
        });
    } catch {
        throw new ApiError(0, 'offline', 'Sin conexión.');
    }

    const data: unknown = await response.json().catch(() => ({}));
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

export const api = {
    me: (): Promise<Me> => request<Me>('GET', '/api/me'),
    login: (email: string, password: string): Promise<Me> => request<Me>('POST', '/api/login', { email, password }),
    logout: (): Promise<unknown> => request('POST', '/api/logout', {}),
};
