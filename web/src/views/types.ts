/** A screen: its element, and what to undo when the person leaves it */
export interface View {
    element: HTMLElement;
    dispose?: () => void;
}

/** Navigates inside the app (History API); links with data-link do the same on click */
export type Navigate = (path: string, options?: { replace?: boolean }) => void;

/**
 * What the app's header does, for a screen that puts the header away (singing a list) and so
 * has to offer it itself: the sync line and signing out.
 */
export interface Account {
    /** Who is signed in; null for a person trying the app with no account */
    email: string | null;
    /** What the header says about the sync ("Sincronizado", "Sin conexión · 2 sin enviar"…) */
    syncText: () => string;
    /** Calls `listener` whenever that line changes; returns how to stop */
    onSync: (listener: (text: string) => void) => () => void;
    /** Signs out (asks first when something written here was never sent) */
    signOut: () => void;
    /** Signs in (for a person with no account: what they wrote here is asked about once they do) */
    signIn: () => void;
}
