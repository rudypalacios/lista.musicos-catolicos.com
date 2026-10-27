import type { Song } from './types.ts';

/**
 * Whether a song that came from the server replaces the local copy.
 *
 * The newest edit wins, by the stamp of the device that made it. A local edit that has not
 * been sent yet (`pending`) and is newer than the server's is kept: it is going to be pushed
 * and will win there too. Everything else takes the server's version, which is how a device
 * learns about edits and deletions made on another.
 */
export function shouldTakeRemote(local: Song | undefined, pending: Song | undefined, remote: Song): boolean {
    if (pending !== undefined && pending.updatedAt > remote.updatedAt) {
        return false;
    }
    if (local === undefined) {
        return true;
    }

    return remote.updatedAt >= local.updatedAt;
}

/**
 * Whether the pending copy is now pointless once `remote` has been taken: the server holds
 * the same edit or a newer one, so pushing it would only be ignored.
 */
export function supersedes(remote: Song, pending: Song | undefined): boolean {
    return pending !== undefined && remote.updatedAt >= pending.updatedAt;
}
