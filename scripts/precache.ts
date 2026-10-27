import { createHash } from 'node:crypto';

/** A file the service worker keeps for offline use: its URL and its content */
export interface ShellFile {
    url: string;
    content: Uint8Array | string;
}

/**
 * A short fingerprint of the shell: it changes when any precached file's URL or content
 * does. It names the service worker's cache, so a deploy that changes the app installs a new
 * worker (and cleans up the old cache), and a deploy that does not leaves everyone alone.
 */
export function shellVersion(files: readonly ShellFile[]): string {
    const hash = createHash('sha256');
    for (const file of [...files].sort((a, b) => a.url.localeCompare(b.url))) {
        hash.update(file.url).update('\0').update(file.content).update('\0');
    }

    return hash.digest('hex').slice(0, 12);
}
