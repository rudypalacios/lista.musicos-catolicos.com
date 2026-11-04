import type { App } from '../app.ts';
import { showToast, type Toast } from '../toast.ts';

/** The apps already watched, so signing in again (which builds the frame again) does not stack a second toast */
const watched = new WeakSet<App>();

/**
 * Everything is saved as it is typed, so there is no "save" button to tell the person it worked:
 * a toast does. It says where the change is ("en este dispositivo") and, once the server has it,
 * that it is synced, so the person knows when the only copy is the one on this device.
 */
export function watchSaves(data: App): void {
    if (watched.has(data)) {
        return;
    }
    watched.add(data);
    let last: Toast | null = null;
    let waiting = false;
    data.onSaved(() => {
        last = showToast('Guardado en este dispositivo');
        waiting = true;
    });
    // The account is full: what was written stays on the device, and the person is told what to do about it
    data.onNotice((text) => showToast(text, 9000, true));
    data.onStatus((status) => {
        if (waiting && status.state === 'idle' && status.pending === 0) {
            waiting = false;
            last?.update('Guardado y sincronizado');
        }
    });
}
