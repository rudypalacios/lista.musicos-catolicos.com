/** A screen: its element, and what to undo when the person leaves it */
export interface View {
    element: HTMLElement;
    dispose?: () => void;
}

/** Navigates inside the app (History API); links with data-link do the same on click */
export type Navigate = (path: string, options?: { replace?: boolean }) => void;
