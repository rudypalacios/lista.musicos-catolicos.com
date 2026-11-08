/**
 * What the bar says on the page of a song: the song's name, the key on screen and whether it is still a draft.
 * The page sets it (and clears it when it goes); the bar (`views/header.ts`) listens. One song at a time, so one value.
 */
export interface SongHeading {
    readonly title: string;
    /** The key on screen in the notation shown, or null when the song has none */
    readonly key: string | null;
    readonly draft: boolean;
}

type Listener = (heading: SongHeading | null) => void;

let current: SongHeading | null = null;
const listeners = new Set<Listener>();

export const songHeading = {
    get: (): SongHeading | null => current,
    set(heading: SongHeading | null): void {
        current = heading;
        for (const listener of listeners) {
            listener(heading);
        }
    },
    /** Calls `listener` whenever the heading changes; returns how to stop */
    subscribe(listener: Listener): () => void {
        listeners.add(listener);

        return () => listeners.delete(listener);
    },
};
