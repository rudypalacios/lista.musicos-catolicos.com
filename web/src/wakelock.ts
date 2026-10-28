/**
 * Keeping the screen on while a song is being read or sung (Screen Wake Lock): a tablet on a
 * stand must not go dark in the middle of a song. The browser drops the lock whenever the page is
 * hidden, so it is asked for again when the page comes back. Several screens may want it at once
 * (the view of one song is made anew for every song of a list), so it is counted, and given back a
 * moment after the last one lets go: moving between songs does not release and re-request it.
 */

export type AwakeState =
    /** The screen is being kept on */
    | 'on'
    /** Nobody asks for it, or the request is on its way */
    | 'off'
    /** This browser has no Wake Lock API */
    | 'unsupported'
    /** The browser refused (battery saver, a page that is not visible…) */
    | 'blocked';

/** The part of a `WakeLockSentinel` that is used, so a fake can stand in for it in tests */
export interface WakeLockSentinelLike {
    addEventListener: (type: 'release', listener: () => void) => void;
    release: () => Promise<void>;
}

/** The part of `navigator.wakeLock` that is used */
export interface WakeLockApi {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/** How long (ms) the lock is kept after the last screen lets go of it */
const GRACE = 1500;

export class ScreenKeeper {
    private readonly api: WakeLockApi | undefined;
    private readonly grace: number;
    private holders = 0;
    private sentinel: WakeLockSentinelLike | null = null;
    private requesting = false;
    private current: AwakeState = 'off';
    private releaseTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly listeners = new Set<(state: AwakeState) => void>();

    constructor(api: WakeLockApi | undefined, grace = GRACE) {
        this.api = api;
        this.grace = grace;
    }

    state(): AwakeState {
        return this.current;
    }

    /** Calls `listener` whenever the state changes; returns how to stop */
    onChange(listener: (state: AwakeState) => void): () => void {
        this.listeners.add(listener);

        return () => this.listeners.delete(listener);
    }

    /**
     * Asks for the screen to stay on.
     *
     * @returns what to call when this screen no longer needs it (calling it twice does nothing more)
     */
    hold(): () => void {
        this.holders++;
        if (this.releaseTimer !== null) {
            clearTimeout(this.releaseTimer);
            this.releaseTimer = null;
        }
        void this.acquire();
        let done = false;

        return () => {
            if (done) {
                return;
            }
            done = true;
            if (--this.holders === 0) {
                this.releaseTimer = setTimeout(() => {
                    this.releaseTimer = null;
                    void this.give();
                }, this.grace);
            }
        };
    }

    /** The page is visible again: the browser dropped the lock while it was hidden */
    resume(): void {
        if (this.holders > 0) {
            void this.acquire();
        }
    }

    private async acquire(): Promise<void> {
        if (this.api === undefined) {
            this.set('unsupported');

            return;
        }
        if (this.sentinel !== null || this.requesting) {
            return;
        }
        this.requesting = true;
        try {
            const sentinel = await this.api.request('screen');
            if (this.holders === 0) {
                // Everyone let go while the request was on its way
                await sentinel.release();

                return;
            }
            this.sentinel = sentinel;
            sentinel.addEventListener('release', () => {
                if (this.sentinel === sentinel) {
                    this.sentinel = null;
                    this.set('off');
                }
            });
            this.set('on');
        } catch {
            // Refused: the screen will go dark on its own, which the person is told (describeAwake)
            this.set('blocked');
        } finally {
            this.requesting = false;
        }
    }

    private async give(): Promise<void> {
        const sentinel = this.sentinel;
        this.sentinel = null;
        this.set('off');
        await sentinel?.release();
    }

    private set(state: AwakeState): void {
        if (state !== this.current) {
            this.current = state;
            this.listeners.forEach((listener) => listener(state));
        }
    }
}

/** What to tell the person about the screen, given what they asked for (the Ajustes choice) and what is so */
export function describeAwake(wanted: boolean, state: AwakeState): string {
    if (!wanted) {
        return 'La pantalla se apaga según el dispositivo (se puede cambiar en Ajustes).';
    }
    switch (state) {
        case 'on':
            return 'La pantalla se mantiene encendida.';
        case 'unsupported':
            return 'Este navegador no deja mantener la pantalla encendida.';
        case 'blocked':
            return 'No se pudo mantener la pantalla encendida (¿ahorro de batería?).';
        default:
            return 'Activando la pantalla encendida…';
    }
}

/** The one the app shares */
export const screenKeeper = new ScreenKeeper((navigator as { wakeLock?: WakeLockApi }).wakeLock);
