/**
 * Sharing a list by a link, from the person's side: what the link looks like and what the sheet says about it.
 * Pure, so it is tested without a screen. The server makes the code (src/Share): 128 random bits as 32 hex characters.
 */

/** A share's code, as the address carries it */
export const CODE_PATTERN = /^[0-9a-f]{32}$/;

/** What the server says about a list's link */
export interface ShareState {
    shared: boolean;
    code?: string;
    withLyrics?: boolean;
}

/** The address a person gives out: this site's own, so it works wherever the app is installed */
export function shareUrl(origin: string, code: string): string {
    return `${origin}/c/${code}`;
}

/** The line at the top of the sheet once the list is shared */
export function shareSummary(withLyrics: boolean): string {
    return withLyrics ? 'Compartido · con letra y acordes' : 'Compartido · solo el orden, los títulos y los autores';
}

/** A sentence for a failure of the share calls: offline is not the server's refusal, and neither is the list not being synced yet */
export function shareFailure(failure: { status: number; message: string } | null): string {
    if (failure === null) {
        return 'No se pudo compartir el listado.';
    }
    if (failure.status === 0) {
        return 'Compartir necesita conexión. Inténtalo cuando la tengas.';
    }

    return failure.message;
}
