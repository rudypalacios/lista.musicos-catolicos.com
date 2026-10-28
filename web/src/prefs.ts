/**
 * Preferences of this device (localStorage, which may be blocked: then they last for the visit).
 * Notation uses the same key as the public site, so the habit carries over.
 */
import type { Notation } from './chordpro/chord.ts';
import type { ColumnMode } from './fit.ts';

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

const INSTALL_HINT = 'lista:instalar-aviso';

/** Whether the person closed the "add it to the home screen" note on this device */
export function readInstallHintClosed(): boolean {
    return read(INSTALL_HINT) === 'si';
}

export function saveInstallHintClosed(): void {
    write(INSTALL_HINT, 'si');
}

const COLUMNS = 'lista:columnas';

/** Columns on a wide screen: "auto" (as the song needs), one, or two */
export function readColumns(): ColumnMode {
    const value = read(COLUMNS);

    return value === 'una' ? 'one' : value === 'dos' ? 'two' : 'auto';
}

export function saveColumns(mode: ColumnMode): void {
    write(COLUMNS, mode === 'one' ? 'una' : mode === 'two' ? 'dos' : 'auto');
}

const LYRIC_COLOR = 'lista:color-letra';

/** The id of the lyric colour chosen (settings.ts), or null for the default */
export function readLyricColor(): string | null {
    return read(LYRIC_COLOR);
}

export function saveLyricColor(id: string): void {
    write(LYRIC_COLOR, id);
}

/**
 * How a list is sung. "rehearsal" shows every tool and lets the person write notes; "event" keeps
 * the tools in a slim bar so the lyrics get the room. Event is the default: the app is mostly
 * opened to sing.
 */
export type Mode = 'rehearsal' | 'event';

const MODE = 'lista:modo';

export function readMode(): Mode {
    return read(MODE) === 'ensayo' ? 'rehearsal' : 'event';
}

export function saveMode(mode: Mode): void {
    write(MODE, mode === 'rehearsal' ? 'ensayo' : 'evento');
}

const LYRIC_SIZE = 'lista:tamano';

/** How many A− / A+ steps the lyrics are away from their size (0 when never changed); the caller clamps it */
export function readLyricSize(): number {
    const value = Number.parseInt(read(LYRIC_SIZE) ?? '', 10);

    return Number.isFinite(value) ? value : 0;
}

export function saveLyricSize(steps: number): void {
    write(LYRIC_SIZE, String(steps));
}

const KEEP_AWAKE = 'lista:pantalla-encendida';

/** Keep the screen on while a song is open: on by default (a tablet on a stand must not go dark) */
export function readKeepAwake(): boolean {
    return read(KEEP_AWAKE) !== 'no';
}

export function saveKeepAwake(on: boolean): void {
    write(KEEP_AWAKE, on ? 'si' : 'no');
}
