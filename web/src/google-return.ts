/**
 * What the server says when the person comes back from Google: it sends the browser to `/?google=<word>` (see
 * `GoogleReturn.php`). The app reads the word once, takes it out of the address, and either opens the account or says in one
 * sentence what happened. Anything that is not a word the server uses counts as a failure: the address is anyone's to type.
 */

export type GoogleReturn =
    /** There is a session now; `created` when this sign-in made the account (so it is a sign-up, for what the person is asked) */
    | { kind: 'signed-in'; created: boolean }
    | { kind: 'problem'; message: string };

/** What a sign-in that did not happen is told to the person */
export const GOOGLE_PROBLEMS = {
    cancelled: 'Cancelaste el ingreso con Google. No se hizo ningún cambio.',
    unverified: 'Google no tiene confirmado el correo de esa cuenta, así que no se pudo entrar con ella. Confírmalo en Google o entra con otra cuenta.',
    busy: 'Demasiados intentos. Espera un rato y vuelve a probar.',
    unavailable: 'Entrar con Google no está disponible por ahora.',
    failed: 'No se pudo entrar con Google. Inténtalo de nuevo.',
} as const;

/**
 * The outcome in a page's query string, and the query string without it (what is left is put back in the address bar).
 * `null` when the page was not opened by a return from Google.
 */
export function readGoogleReturn(search: string): { result: GoogleReturn; rest: string } | null {
    const params = new URLSearchParams(search);
    const word = params.get('google');
    if (word === null) {
        return null;
    }
    params.delete('google');
    const left = params.toString();
    const rest = left === '' ? '' : `?${left}`;

    if (word === 'ok' || word === 'new') {
        return { result: { kind: 'signed-in', created: word === 'new' }, rest };
    }
    const known = Object.keys(GOOGLE_PROBLEMS).includes(word) ? (word as keyof typeof GOOGLE_PROBLEMS) : 'failed';

    return { result: { kind: 'problem', message: GOOGLE_PROBLEMS[known] }, rest };
}
