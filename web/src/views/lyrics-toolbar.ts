import type { CaseMode } from '../chordpro/letter-case.ts';
import type { InsertKind } from '../chordpro/insert.ts';
import { h } from '../dom.ts';

export interface LyricsToolbarOptions {
    /** The "− key +" control, built by the editor (it knows the key of the text): it stays in the bar, always in sight */
    tone: HTMLElement;
    /** "Formato": the words in this case */
    onCase: (mode: CaseMode) => void;
    /** "Insertar": write this at the cursor, or around what is selected */
    onInsert: (kind: InsertKind) => void;
    /** Whether lyrics are selected now: the menu of "Insertar" says what it will do with them */
    hasSelection: () => boolean;
}

export interface LyricsToolbar {
    /** Goes flush on top of the box of the lyrics, inside one wrapper with it */
    element: HTMLElement;
    dispose: () => void;
}

interface Menu {
    wrap: HTMLElement;
    close: () => void;
}

/** An item of "Insertar": how it will look in the song, what it does, and the text it writes */
interface InsertItem {
    kind: InsertKind;
    sample: HTMLElement;
    /** What it does at the cursor, and (when it works on the lines) with a selection */
    hint: string;
    selectedHint?: string;
    code: string;
}

const ITEMS_IN_THE_LYRICS: readonly InsertItem[] = [
    { kind: 'section', sample: h('span', { class: 'song-section__label' }, 'Sección'), hint: 'Una etiqueta: Coro, Verso 2…', selectedHint: 'Las líneas seleccionadas pasan a ser la etiqueta', code: '{c: }' },
    { kind: 'note', sample: h('span', { class: 'lyrics-menu__note' }, 'Indicación'), hint: 'Una nota en cursiva: Intro, x2…', selectedHint: 'Las líneas seleccionadas pasan a ser la nota', code: '{ci: }' },
    { kind: 'chorus', sample: h('span', { class: 'lyrics-menu__chorus' }, 'Coro'), hint: 'Un coro con raya de color', selectedHint: 'Rodea las líneas seleccionadas', code: '{soc}' },
];

const ITEMS_ABOVE: readonly InsertItem[] = [
    { kind: 'capo', sample: h('span', { class: 'chip' }, 'Capo'), hint: 'Traste donde va la cejilla', code: '{capo: }' },
    { kind: 'tempo', sample: h('span', { class: 'chip' }, 'Tempo'), hint: 'Pulsos por minuto', code: '{tempo: }' },
    { kind: 'time', sample: h('span', { class: 'chip' }, 'Compás'), hint: 'Por ejemplo 4/4 o 3/4', code: '{time: }' },
];

/**
 * The bar of the lyrics box, in the editor: the key (− key +) and two menus, "Formato" and "Insertar", so more tools can be
 * added to a menu without widening the bar. It sits flush on top of the text, inside one wrapper with it (`.composer`), so
 * the two read as one box; it never touches the text area itself, it only calls what the editor gives it.
 */
export function createLyricsToolbar(options: LyricsToolbarOptions): LyricsToolbar {
    const menus: Menu[] = [];
    const closeAll = (): void => {
        for (const menu of menus) {
            menu.close();
        }
    };

    /**
     * A button that opens a list. One is open at a time; a choice, a touch outside or Escape closes it. The list is drawn
     * by `draw` each time it opens, so it can speak of the selection that is there then.
     */
    const createMenu = (label: string, align: 'left' | 'right', draw: (popup: HTMLElement) => void): Menu => {
        const button = h('button', { type: 'button', class: 'lyrics-toolbar__menu', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, label, h('i', { 'aria-hidden': 'true' }));
        const popup = h('div', { class: 'lyrics-menu', role: 'menu', 'aria-label': label, 'data-align': align, hidden: true });
        const close = (): void => {
            popup.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        };
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const opening = popup.hidden;
            closeAll();
            if (opening) {
                popup.replaceChildren();
                draw(popup);
                popup.hidden = false;
                button.setAttribute('aria-expanded', 'true');
            }
        });
        popup.addEventListener('click', (event) => {
            event.stopPropagation();
            if ((event.target as HTMLElement).closest('button') !== null) {
                closeAll();
            }
        });
        const menu: Menu = { wrap: h('div', { class: 'lyrics-toolbar__wrap' }, button, popup), close };
        menus.push(menu);

        return menu;
    };

    const caseItem = (mode: CaseMode, name: string, example: string): HTMLElement => {
        const item = h('button', { type: 'button', role: 'menuitem', class: 'lyrics-menu__item' }, h('span', {}, name), h('span', { class: 'lyrics-menu__example' }, example));
        item.addEventListener('click', () => options.onCase(mode));

        return item;
    };
    const format = createMenu('Formato', 'left', (popup) => {
        popup.append(
            h('h4', {}, 'Solo las palabras, no los acordes'),
            caseItem('lower', 'minúsculas', 'aa'),
            caseItem('upper', 'MAYÚSCULAS', 'AA'),
            caseItem('sentence', 'Tipo oración', 'Aa'),
        );
    });

    const insertItem = (item: InsertItem, selected: boolean): HTMLElement => {
        const button = h('button', { type: 'button', role: 'menuitem', class: 'lyrics-menu__item' },
            h('span', { class: 'lyrics-menu__what' }, item.sample.cloneNode(true), h('small', {}, selected && item.selectedHint !== undefined ? item.selectedHint : item.hint)),
            h('code', {}, item.code));
        button.addEventListener('click', () => options.onInsert(item.kind));

        return button;
    };
    const insert = createMenu('Insertar', 'right', (popup) => {
        const selected = options.hasSelection();
        popup.append(
            h('h4', {}, selected ? 'Con el texto seleccionado' : 'En la letra, donde está el cursor'),
            ...ITEMS_IN_THE_LYRICS.map((item) => insertItem(item, selected)),
            h('hr', {}),
            h('h4', {}, 'Arriba de la letra'),
            ...ITEMS_ABOVE.map((item) => insertItem(item, selected)),
        );
    });

    // A touch anywhere else, or Escape, puts the open list away
    const away = (): void => closeAll();
    const escape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            closeAll();
        }
    };
    document.addEventListener('click', away);
    document.addEventListener('keydown', escape);

    const element = h('div', { class: 'lyrics-toolbar', role: 'toolbar', 'aria-label': 'Herramientas de la letra' },
        options.tone, h('span', { class: 'lyrics-toolbar__sep', 'aria-hidden': 'true' }), format.wrap, insert.wrap);

    return {
        element,
        dispose: () => {
            document.removeEventListener('click', away);
            document.removeEventListener('keydown', escape);
        },
    };
}
