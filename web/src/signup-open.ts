import { api } from './api.ts';

/**
 * Whether anyone can create an account now (the owner opens it, see SIGNUP_OPEN in .env). The app offers "Crear cuenta"
 * only when it will work. The last answer is kept on the device so the first screen does not wait for the network, and
 * is asked again in the background. Nothing here is an error: with no answer, "Crear cuenta" is simply not offered.
 */
const KEY = 'lista-signup-open';

/** The last answer this device heard, false before the first */
export function knownSignupOpen(): boolean {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch {
        return false;
    }
}

/** Asks the server and keeps the answer; with no answer (offline), the last one stands */
export async function refreshSignupOpen(): Promise<boolean> {
    try {
        const open = await api.signupOpen();
        try {
            localStorage.setItem(KEY, open ? '1' : '0');
        } catch {
            // Not kept: the next start asks again
        }

        return open;
    } catch {
        return knownSignupOpen();
    }
}
