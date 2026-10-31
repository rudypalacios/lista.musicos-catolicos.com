/**
 * The template the person started a list from last, kept on this device only (it is a convenience: what is at hand
 * first when choosing, not data that has to follow the person). Storage can be missing or refuse (a private window):
 * then nothing is remembered and the templates come by name.
 */
const KEY = 'lista:last-template';

export function readLastTemplate(): string | null {
    try {
        return localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

export function rememberTemplate(id: string): void {
    try {
        localStorage.setItem(KEY, id);
    } catch {
        // Nothing to do: the choice is only a convenience
    }
}
