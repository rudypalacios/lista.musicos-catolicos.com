import './print.css';
import { transpose } from '../chordpro/chord.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { h, setSheet } from '../dom.ts';
import type { SheetPlan } from './plan.ts';

const ROOT_ID = 'print-root';

/** The pages of the plans, one song each, as print.css lays them out */
export function printPages(plans: readonly SheetPlan[]): HTMLElement[] {
    return plans.map((plan) => {
        const head = h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, plan.title));
        if (plan.subtitle !== '') {
            head.append(h('p', { class: 'page-head__sub' }, plan.subtitle));
        }
        const page = h('article', { class: 'print-page', 'data-print': plan.version }, head);

        if (plan.note.length > 0) {
            const items = plan.note.map((item) => h(
                'div',
                { class: 'song-note__item' },
                h('dt', item.label === '' ? { class: 'sr-only' } : {}, item.label === '' ? 'Tempo' : item.label),
                h('dd', {}, item.value),
            ));
            page.append(h('dl', { class: 'song-note', 'aria-label': 'Datos musicales' }, ...items));
        }

        const sheet = h('div', {
            class: 'song-sheet' + (plan.layout === 'normal' ? '' : ` song-sheet--${plan.layout}-${plan.version}`),
        });
        setSheet(sheet, sheetHtml(plan.sheet));
        for (const chord of sheet.querySelectorAll<HTMLElement>('.ch[data-chord]')) {
            chord.textContent = transpose(chord.dataset['chord'] ?? '', plan.shift, plan.notation);
        }
        page.append(sheet);

        return page;
    });
}

/** Waits for the print fonts, but never for long: a sheet in the fallback font beats a silent wait */
async function fontsReady(): Promise<void> {
    if (!('fonts' in document)) {
        return;
    }
    const loading = Promise.all([
        document.fonts.load('400 13pt "Atkinson Hyperlegible"'),
        document.fonts.load('700 13pt "Atkinson Hyperlegible"'),
        document.fonts.load('800 20pt "Bricolage Grotesque"'),
    ]).catch(() => undefined);
    await Promise.race([loading, new Promise((resolve) => setTimeout(resolve, 2000))]);
}

/**
 * Browsers name the PDF they save after the page's title, so while the print dialog is open the title is
 * `name` (the song's or the list's), and it goes back once printing ends.
 */
function titledAs(name: string): void {
    const before = document.title;
    let restored = false;
    const restore = (): void => {
        if (!restored) {
            restored = true;
            document.title = before;
            window.removeEventListener('afterprint', restore);
        }
    };
    document.title = name;
    window.addEventListener('afterprint', restore);
    // Some browsers never say it ended (a dialog that is closed without printing): do not keep the name for good
    setTimeout(restore, 60_000);
}

/**
 * Fills #print-root with the pages and opens the browser's print dialog (AirPrint on an iPad).
 *
 * @param name what the saved PDF is called: the title of the list, or of the song
 */
export async function printPlans(plans: readonly SheetPlan[], name?: string): Promise<void> {
    let root = document.getElementById(ROOT_ID);
    if (root === null) {
        root = h('div', { id: ROOT_ID, 'aria-hidden': 'true' });
        document.body.append(root);
    }
    root.replaceChildren(...printPages(plans));
    await fontsReady();
    if (name !== undefined && name.trim() !== '') {
        titledAs(name.trim());
    }
    window.print();
}
