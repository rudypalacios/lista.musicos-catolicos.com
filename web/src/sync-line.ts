import type { Status } from './app.ts';

/**
 * How loudly the header speaks about the sync:
 * - `ok`: all sent, only a dot;
 * - `busy`: a sync running, the dot pulses;
 * - `pending`: online, with something about to be sent: an amber dot and no line, because this lasts a
 *   second after every edit and a line that came and went would make the screen jump;
 * - `quiet`: no connection and nothing waiting to be sent, a muted line;
 * - `warn`: something is waiting with no way to send it, failed or needs the person: an amber line.
 */
export type SyncTone = 'ok' | 'busy' | 'pending' | 'quiet' | 'warn';

export interface SyncLine {
    text: string;
    tone: SyncTone;
}

/** What the header says about the sync. The line under the header shows only for `quiet` and `warn`. */
export function describeSync(status: Status): SyncLine {
    const unsent = status.pending > 0 ? `${status.pending} sin enviar` : '';
    const refused = status.rejected > 0 ? `${status.rejected} rechazado${status.rejected === 1 ? '' : 's'}` : '';
    const extra = [unsent, refused].filter((part) => part !== '').join(' · ');
    if (!status.durable) {
        return { text: 'Este navegador no guarda datos sin conexión', tone: 'warn' };
    }
    switch (status.state) {
        case 'syncing':
            return { text: 'Sincronizando…', tone: 'busy' };
        case 'offline':
            return { text: extra !== '' ? `Sin conexión · ${extra}` : 'Sin conexión', tone: extra !== '' ? 'warn' : 'quiet' };
        case 'signed-out':
            return { text: 'La sesión terminó', tone: 'warn' };
        case 'error':
            return { text: extra !== '' ? `Error al sincronizar · ${extra}` : 'Error al sincronizar', tone: 'warn' };
        default:
            // A refused record will not be sent by waiting: that one speaks. Only unsent ones are about to go.
            return extra === '' ? { text: 'Sincronizado', tone: 'ok' } : { text: extra, tone: status.rejected > 0 ? 'warn' : 'pending' };
    }
}

/** Whether the line under the header has something to say */
export function showsLine(tone: SyncTone): boolean {
    return tone === 'quiet' || tone === 'warn';
}
