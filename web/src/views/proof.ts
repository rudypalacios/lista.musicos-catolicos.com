import { api, type Proof } from '../api.ts';
import { h } from '../dom.ts';
import { solve } from '../pow.ts';

/** The words under a form while the device solves the puzzle the server asks before a sign-up or a reset */
export interface ProofStatus {
    element: HTMLElement;
    /** Asks the server for a puzzle and solves it here, saying what it is doing; rejects if the screen was left */
    obtain: () => Promise<Proof>;
    /** Stops a puzzle in progress (the person left the screen) */
    cancel: () => void;
}

/**
 * "Comprobando que eres una persona…": the proof of work (src/Security/ProofOfWork.php) takes the device a moment, so it
 * says what it is waiting for, with a spinner. Nothing is sent anywhere but the server of the app.
 */
export function createProofStatus(): ProofStatus {
    const element = h('p', { class: 'muted proof', role: 'status', hidden: true },
        h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Comprobando que eres una persona…');
    let cancelled = false;

    return {
        element,
        obtain: async () => {
            cancelled = false;
            element.hidden = false;
            try {
                const puzzle = await api.challenge();
                const nonce = await solve(puzzle, { cancelled: () => cancelled });

                return { challenge: puzzle.challenge, nonce };
            } finally {
                element.hidden = true;
            }
        },
        cancel: () => {
            cancelled = true;
        },
    };
}
