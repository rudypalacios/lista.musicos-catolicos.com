import type { Stamped } from './types.ts';

/**
 * Whether a record that came from the server replaces the local copy.
 *
 * The newest edit wins, by the stamp of the device that made it. A local edit that has not
 * been sent yet (`pending`) and is newer than the server's is kept: it is going to be pushed
 * and will win there too. Everything else takes the server's version, which is how a device
 * learns about edits and deletions made on another.
 */
export function shouldTakeRemote(
    local: Pick<Stamped, 'updatedAt'> | undefined,
    pending: Pick<Stamped, 'updatedAt'> | undefined,
    remote: Pick<Stamped, 'updatedAt'>,
): boolean {
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
export function supersedes(remote: Pick<Stamped, 'updatedAt'>, pending: Pick<Stamped, 'updatedAt'> | undefined): boolean {
    return pending !== undefined && remote.updatedAt >= pending.updatedAt;
}
