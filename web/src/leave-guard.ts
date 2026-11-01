/**
 * A screen with something written and not saved asks before the person leaves it, whichever way they go: a link or
 * the bar's "back" (`askToLeave`, from the router's click handler) or the device's back button (the router puts the
 * address back and asks). One screen at a time holds the guard and gives it up when it goes.
 */
export interface LeaveGuard {
    /** Whether there is something that would be lost */
    isDirty: () => boolean;
    /** Asks the person; resolves true when leaving is fine (discarded, or saved), false to stay */
    ask: () => Promise<boolean>;
}

let current: LeaveGuard | null = null;

/** Sets the guard of the screen shown; null when it goes */
export function setLeaveGuard(guard: LeaveGuard | null): void {
    current = guard;
}

/** Whether leaving now would lose something */
export function leaveIsRisky(): boolean {
    return current?.isDirty() === true;
}

/** Resolves true when the person may leave (nothing to lose, or they answered) */
export function askToLeave(): Promise<boolean> {
    return current !== null && current.isDirty() ? current.ask() : Promise.resolve(true);
}
