import type { Notation } from '../chordpro/chord.ts';
import { h } from '../dom.ts';
import type { PrintVersion } from '../print/layout.ts';
import type { SheetPlan } from '../print/plan.ts';
import { printPlans } from '../print/print.ts';
import { readNotation } from '../prefs.ts';

/**
 * "Imprimir": with chords (for the musicians) or lyrics only (to hand out), as the public site
 * offers. `plans` is asked for at the moment of printing, so it reflects the key on screen. The
 */
export function printMenu(plans: (version: PrintVersion, notation: Notation) => SheetPlan[]): HTMLElement {
    const status = h('p', { class: 'muted print-menu__status', role: 'status' });
    const choose = (label: string, version: PrintVersion): HTMLButtonElement => {
        const button = h('button', { type: 'button', class: 'button' }, label);
        button.addEventListener('click', () => {
            menu.open = false;
            status.textContent = '';
            printPlans(plans(version, readNotation())).catch(() => {
                status.textContent = 'No se pudo preparar la impresión.';
            });
        });

        return button;
    };
    const menu = h(
        'details',
        { class: 'print-menu' },
        h('summary', { class: 'button' }, 'Imprimir'),
        h('div', { class: 'print-menu__options' }, choose('Con acordes', 'chords'), choose('Solo letra', 'lyrics')),
    );

    return h('span', { class: 'print-menu__wrap' }, menu, status);
}
