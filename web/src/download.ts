import type { App } from './app.ts';
import { zip } from './zip.ts';
import { hasLibrary, libraryFiles } from './export.ts';
import { readNotation } from './prefs.ts';

/** Gives the browser a file to save: a link to the bytes, touched, and forgotten a moment later (the save has begun by then) */
export function saveFile(name: string, bytes: Uint8Array, type: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Today as `2026-11-28`, in the person's own day, for the name of the copy */
function today(now: Date): string {
    const two = (n: number): string => String(n).padStart(2, '0');

    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/**
 * "Descargar mis cantos": every song and list the device holds, in one `.zip`. It reads the device, not the server, so it
 * works with no connection.
 *
 * @returns how many songs went in, or null when there was nothing to take
 */
export async function downloadLibrary(data: App, now: Date = new Date()): Promise<number | null> {
    const songs = await data.list();
    const lists = await data.setlists.list();
    if (!hasLibrary(songs, lists)) {
        return null;
    }
    const encoder = new TextEncoder();
    const files = libraryFiles(songs, lists, readNotation()).map((file) => ({ name: file.name, data: encoder.encode(file.text) }));
    saveFile(`mis-cantos-${today(now)}.zip`, zip(files, now), 'application/zip');

    return songs.length;
}
