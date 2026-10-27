/**
 * Preferences of this device (localStorage, which may be blocked: then they last for the visit).
 * Notation uses the same key as the public site, so the habit carries over.
 */
import type { Notation } from './chordpro/chord.ts';

const NOTATION = 'mc-notacion';
const FIT = 'lista:ajuste';

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage blocked (private mode): the choice lasts for this visit
    }
}

/** Latin (Do, Re, Mi) unless the person chose English (C, D, E) */
export function readNotation(): Notation {
    return read(NOTATION) === 'en' ? 'english' : 'latin';
}

export function saveNotation(notation: Notation): void {
    write(NOTATION, notation === 'english' ? 'en' : 'lat');
}

/** "Ajustar a la pantalla": on by default, per device (a tablet on a stand wants it, a phone may not) */
export function readFit(): boolean {
    return read(FIT) !== 'no';
}

export function saveFit(on: boolean): void {
    write(FIT, on ? 'si' : 'no');
}
