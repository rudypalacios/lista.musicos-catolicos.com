/**
 * Which shape of record this device last read in full from the server.
 *
 * A pull goes from a cursor, so a record the device already read is not sent again. If an older app read it, that app dropped
 * the fields it did not know (the link to hear a song, for instance) and the newer app would never see them: the cursor is past
 * them. Whenever a record gains a field, `PULL_SHAPE` goes up: the first sync of a device that has not read that shape in full is a
 * full one (`SyncEngine.sync({ full: true })`), once. It is only a hint kept on the device (`localStorage`); with none, the device
 * does one full sync each time it opens, which costs a little and is never wrong.
 */
export const PULL_SHAPE = 2;

const KEY = 'lista.pull-shape';

/** Whether this device has yet to read everything once for the current shape */
export function needsFullPull(): boolean {
    try {
        return Number(localStorage.getItem(KEY)) < PULL_SHAPE;
    } catch {
        return true;
    }
}

/** Says the device has read everything for the current shape */
export function markFullPull(): void {
    try {
        localStorage.setItem(KEY, String(PULL_SHAPE));
    } catch {
        // no storage: the next sync is a full one again
    }
}
