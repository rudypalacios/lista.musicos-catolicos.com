import { ApiError, readShared } from '../api.ts';
import { h, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { readChords, readNotation, saveChords } from '../prefs.ts';
import { planSheet } from '../print/plan.ts';
import type { PrintVersion } from '../print/layout.ts';
import { printPlans } from '../print/print.ts';
import { matchRoute, paths } from '../router.ts';
import { asSong, bySection, copyNote, countLabel, keyOf, readingOrder, updatedLabel, type Row, type SharedList } from '../shared-model.ts';
import { openCopies } from '../shared-store.ts';
import { barFoldPoint, nextFold, type FoldState } from '../fold.ts';
import { dragOffset, isSwipe, swipeAxis, type Axis } from '../swipe.ts';
import type { Song } from '../data/types.ts';
import { pageIndexOf, pagesOf, positionText, squaresLayout } from '../data/pages.ts';
import { createReader, type Reader } from './reader.ts';
import { createSheet, dismissSheetOnBack } from './sheet.ts';
import { createListenSheet, listenableOf, listenButton } from './listen.ts';

/**
 * A list (or one song) somebody shared, as a visitor reads it: no account, no menu, nothing to edit or save. It is the same app (the same
 * service worker, the same lyrics reader) dressed like the public pages of Músicos Católicos, which it shares its colours and
 * typefaces with, but built to read the words: the header is one thin row, the footer is folded away, and a song is shown as
 * when singing a list (the lyrics fitted to the screen, the tools folded under the bar, a swipe to change song).
 *
 * The visitor's list is kept on their device, in a store of its own (shared-store.ts), so it opens with no connection. The
 * page loads nothing from another domain and sets no cookie; there is no analytics and no ads (the privacy text says so).
 */

const SITE = 'https://www.musicos-catolicos.com';
const LEGAL: readonly (readonly [string, string])[] = [
    ['Acerca de', '/acerca/'],
    ['Contacto', '/contacto/'],
    ['Privacidad', '/privacidad/'],
    ['Aviso legal', '/legal/'],
    ['Derechos de autor', '/derechos-de-autor/'],
];
/** What a visitor is told about the words */
const RIGHTS = 'Para uso personal. Las letras y los acordes pertenecen a sus autores.';
/** How long a song takes to leave the screen on a swipe (ms) and how far it goes, as a share of the stage's width */
const EXIT_TIME = 180;
const EXIT_DISTANCE = 0.45;

/** The public site's mark: a circle with a cross, drawn (not typed) so it is the same on every device */
const MARK = '<svg width="22" height="22" viewBox="0 0 28 28" fill="none" stroke-width="2" aria-hidden="true" focusable="false">'
    + '<circle cx="14" cy="14" r="12"/><path d="M14 6.5v15M9.5 11h9"/></svg>';

function external(href: string, ...children: (Node | string)[]): HTMLAnchorElement {
    return h('a', { href, target: '_blank', rel: 'noopener' }, ...children);
}

/** The thin bar of the list: just the mark of the site */
function header(): HTMLElement {
    const brand = h('a', { class: 'pub-brand', href: `${SITE}/`, target: '_blank', rel: 'noopener' });
    setSheet(brand, MARK);
    brand.append('Músicos Católicos');

    return h('header', { class: 'pub-head' }, h('div', { class: 'pub-wrap pub-head__inner' }, brand));
}

/**
 * The foot of the site, folded away: only a small tab at the bottom edge shows. It opens over the page (it takes no room
 * while closed and moves nothing when it opens) and closes with its own tab or Escape.
 */
function createFold(): HTMLElement {
    const open = h('button', { type: 'button', class: 'pub-fold__tab', 'aria-expanded': 'false', 'aria-controls': 'pub-fold', 'aria-label': 'Mostrar el pie' },
        h('span', { class: 'pub-fold__grip' }, icon('chevron-up', 16)));
    const close = h('button', { type: 'button', class: 'pub-fold__close', 'aria-label': 'Ocultar el pie' }, h('span', { class: 'pub-fold__grip' }, icon('chevron-down', 16)));
    const panel = h('div', { class: 'pub-fold__panel', id: 'pub-fold' },
        close,
        h('nav', { 'aria-label': 'Pie de página' }, h('ul', { class: 'pub-fold__links' },
            ...LEGAL.map(([name, path]) => h('li', {}, external(`${SITE}${path}`, name))))),
        h('p', { class: 'pub-fold__copy' }, `© ${new Date().getFullYear()} Músicos-Católicos.com · ${RIGHTS}`));
    panel.inert = true;
    const set = (shown: boolean): void => {
        panel.classList.toggle('is-open', shown);
        panel.inert = !shown;
        open.hidden = shown;
        open.setAttribute('aria-expanded', String(shown));
        (shown ? close : open).focus({ preventScroll: true });
    };
    open.addEventListener('click', () => set(true));
    close.addEventListener('click', () => set(false));
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            set(false);
        }
    });

    return h('div', { class: 'pub-fold' }, open, panel);
}

/** "Imprimir": the two sheets the public site offers, for the musicians (with chords) and to hand out; it opens downwards */
function printMenu(print: (version: PrintVersion) => void): HTMLElement {
    const button = h('button', { type: 'button', class: 'pub-tool', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Imprimir' }, icon('printer', 20));
    const option = (label: string, hint: string, version: PrintVersion): HTMLElement => {
        const entry = h('button', { type: 'button', class: 'pub-print__option' }, label, h('small', {}, hint));
        entry.addEventListener('click', () => {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            print(version);
        });

        return entry;
    };
    const menu = h('span', { class: 'pub-print__menu', hidden: true },
        option('Con acordes', 'para los músicos', 'chords'), option('Solo letra', 'para repartir', 'lyrics'));
    const wrapper = h('span', { class: 'pub-print' }, button, menu);
    const fold = (): void => {
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
    };
    button.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        button.setAttribute('aria-expanded', String(!menu.hidden));
    });
    // A touch anywhere else, or Escape, puts the menu away (and once its page is gone the listeners go too)
    const away = (event: Event): void => {
        if (!wrapper.isConnected) {
            document.removeEventListener('click', away);
            document.removeEventListener('keydown', escape);
        } else if (!wrapper.contains(event.target as Node)) {
            fold();
        }
    };
    const escape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            fold();
        }
    };
    document.addEventListener('click', away);
    document.addEventListener('keydown', escape);

    return wrapper;
}

/** What the page says when it cannot show the list: never a blank screen */
function message(text: string, ...extra: HTMLElement[]): HTMLElement {
    return h('div', { class: 'pub-gone' }, icon('link', 48), h('h1', {}, text), ...extra);
}

/** The semitones of a key as 0 to 11, so a key the list has as −2 and one the reader holds as 10 are the same */
const same = (a: number, b: number): boolean => ((a % 12) + 12) % 12 === ((b % 12) + 12) % 12;

/**
 * Shows the shared list at `code` in `root` and keeps it while the visitor moves between the list and its songs
 * (`/c/:code` and `/c/:code/:n`: the addresses are real, so back and reload work).
 */
export function startShared(root: HTMLElement, code: string): void {
    // The app's frame is a screen of fixed height with a rail at the left; a visitor's page is a page that scrolls
    root.classList.add('is-public');
    const copies = openCopies();
    let list: SharedList | null = null;
    /** Set while what is shown is the copy kept on the device: why, and when it was made */
    let fromCopy: { offline: boolean; savedAt: number } | null = null;
    /** The screen on show: what to undo when it is replaced */
    let dispose: () => void = () => undefined;
    /** Where a song came from as it slides in, and what the keys ← → do on the song shown */
    let slideFrom: 'next' | 'previous' | null = null;
    let navigate: { previous: () => void; next: () => void } | null = null;

    const show = (...content: (Node | string)[]): void => {
        dispose();
        dispose = () => undefined;
        navigate = null;
        root.replaceChildren(h('div', { class: 'pub' }, ...content, createFold()));
        window.scrollTo(0, 0);
    };

    const listPage = (data: SharedList): void => {
        const rows = readingOrder(data);
        const notation = readNotation();
        const print = (version: PrintVersion): void => {
            printPlans(rows.map((row) => planSheet(asSong(row.song, data.updatedAt), {
                version, shift: row.item.transpose, notation, part: row.part.name,
            })), data.title).catch(() => undefined);
        };
        const body = h('div', { class: 'pub-list' });
        // The ♪ of a song that has a link: the same button as in the app, YouTube's player in a sheet
        const listenSheet = createListenSheet();
        for (const group of bySection(rows)) {
            body.append(h('h2', { class: 'pub-sec' }, group.part.name));
            for (const row of group.rows) {
                const key = keyOf(row.song, row.item.transpose, notation);
                const text = [h('span', { class: 'pub-row__title' }, row.song.title),
                    ...(row.song.author === '' ? [] : [h('small', {}, row.song.author)])];
                const read = listenableOf({ listenUrl: row.song.listenUrl ?? '' });
                const heard = read === null ? null : listenButton(read, row.song.title, () => listenSheet.open({ title: row.song.title, author: row.song.author, listenUrl: row.song.listenUrl ?? '' }), 'pub-row__listen');
                const plain = h('div', { class: 'pub-row is-plain' },
                    h('span', { class: 'pub-row__n' }, String(row.n)), h('span', { class: 'pub-row__text' }, ...text), ...(heard === null ? [] : [heard]));
                const link = h('a', { class: 'pub-row', href: paths.shared(code, row.n), 'data-link': true },
                    h('span', { class: 'pub-row__n' }, String(row.n)), h('span', { class: 'pub-row__text' }, ...text),
                    ...(key === null ? [] : [h('span', { class: 'pub-row__key' }, key)]), icon('chevron-right', 20));
                // A button cannot live inside a link: the row is a link and the ♪ sits beside it
                body.append(!data.withLyrics ? plain : heard === null ? link : h('div', { class: 'pub-row-wrap' }, link, heard));
            }
        }
        // Where the list comes from: the server, or the copy kept here; and that it can be read with no connection
        const note = fromCopy === null ? null : copyNote(fromCopy.offline, fromCopy.savedAt);
        const sub = `${countLabel(rows.length)} · Actualizado el ${updatedLabel(data.updatedAt)}`;

        show(
            header(),
            h('main', { class: 'pub-main', id: 'main' }, h('div', { class: 'pub-wrap' }, h('div', { class: 'pub-page' },
                h('div', { class: 'pub-kick' }, h('span', {}, 'Listado compartido'), ...(data.withLyrics && rows.length > 0 ? [printMenu(print)] : [])),
                h('h1', { class: 'pub-title' }, data.title),
                h('p', { class: 'pub-sub' }, sub, ...(note === null ? [' · ', h('b', { class: 'pub-ok' }, 'Disponible sin conexión')] : [])),
                ...(note === null ? [] : [h('p', { class: 'pub-offline', role: 'status' }, icon('info', 16), h('span', {}, h('b', {}, note.lead), note.rest))]),
                ...(data.withLyrics ? [] : [h('p', { class: 'pub-banner' }, icon('info', 20),
                    h('span', {}, 'Quien lo compartió eligió mostrar solo el orden, sin letras ni acordes.'))]),
                ...(rows.length === 0 ? [h('p', { class: 'pub-sub' }, 'Este listado todavía no tiene cantos.')] : [body])))),
            listenSheet.element,
        );
        dispose = () => listenSheet.release();
    };

    const songPage = (data: SharedList, row: Row, rows: readonly Row[]): void => {
        // A page is one song, or two the owner divided: each in its square, and the tools speak of the selected one
        const items = rows.map((entry) => entry.item);
        const pages = pagesOf(items);
        const pageIndex = Math.max(0, pageIndexOf(pages, row.item.id));
        const pageItems = pages[pageIndex] ?? [row.item];
        const pageRows = pageItems.map((item) => rows.find((entry) => entry.item.id === item.id) as Row);
        const divided = pageRows.length === 2;
        let focus = Math.max(0, pageRows.findIndex((entry) => entry.n === row.n));
        // "Acordes": the visitor's own choice, kept on this device like the size and the notation. With no chords there is no key to move.
        let chordsShown = readChords();
        const chordsSwitch = h('button', { type: 'button', class: 'pub-tools__switch', role: 'switch', 'aria-checked': String(chordsShown) },
            h('span', {}, 'Acordes'), h('span', { class: chordsShown ? 'switch is-on' : 'switch', 'aria-hidden': 'true' }));
        const keyText = h('b', {});
        const stripKey = h('span', { class: 'pub-strip__key' });
        const barKey = h('span', { class: 'perform__song-key' });
        const keyButton = h('button', { type: 'button', class: 'pub-tool pub-key' }, h('small', {}, 'Tono'), keyText);
        const down = h('button', { type: 'button', class: 'pub-tool', 'aria-label': 'Bajar medio tono' }, '−');
        const up = h('button', { type: 'button', class: 'pub-tool', 'aria-label': 'Subir medio tono' }, '+');
        // A link to one song has no list to go back to and no neighbours: just the song, its author and the tools
        const single = data.kind === 'song';
        const barPart = h('small', {});
        const barTitle = h('b', {});
        const stripTitle = h('strong', {});
        const countText = h('span', {});
        const stripCount = h('span', { class: 'pub-strip__count' });

        // "Escuchar el original": in the tools, for the selected song when it has a link (YouTube's player in a sheet, another site apart)
        const listenSheet = createListenSheet();
        const listenTool = h('button', { type: 'button', class: 'pub-tools__switch pub-tools__listen' }, h('span', {}, 'Escuchar el original'), icon('music', 20));
        listenTool.addEventListener('click', () => {
            const { song } = selected();
            setTools(false);
            listenSheet.open(song);
        });

        /** One song on the screen: its square, its reader and the key the list has it in */
        interface Square { row: Row; song: Song; listKey: number; reader: Reader; element: HTMLElement }
        const squares: Square[] = [];
        const selected = (): Square => squares[focus] as Square;
        const paint = (): void => {
            // The readers call back while they are being made
            if (squares.length < pageRows.length) {
                return;
            }
            const { reader, listKey, row: current } = selected();
            const name = reader.keyName(reader.shift());
            const changed = !same(reader.shift(), listKey);
            keyText.textContent = name ?? '';
            listenTool.hidden = listenableOf(selected().song) === null;
            stripKey.textContent = chordsShown ? name ?? '' : '';
            stripKey.classList.toggle('is-changed', changed);
            barKey.textContent = chordsShown ? name ?? '' : '';
            barKey.hidden = barKey.textContent === '';
            barKey.classList.toggle('is-today', changed);
            // A song with no chords has no key to move
            for (const control of [keyButton, down, up]) {
                control.hidden = name === null || !chordsShown;
            }
            // Moved off the list's key: yellow and a way back, so it is clear the chords are not the list's
            keyButton.classList.toggle('is-changed', changed);
            keyButton.setAttribute('aria-label', changed ? `Tono ${name ?? ''}. Volver al tono del listado` : `Tono ${name ?? ''}`);
            barPart.textContent = single ? (current.song.author === '' ? 'Canto compartido' : current.song.author) : current.part.name;
            barPart.className = single ? '' : 'is-part';
            barTitle.textContent = current.song.title;
            stripTitle.textContent = current.song.title;
            const where = positionText(items, pageItems);
            countText.textContent = where;
            stripCount.textContent = where;
        };
        for (const [index, entry] of pageRows.entries()) {
            const song = asSong(entry.song, data.updatedAt);
            const listKey = entry.item.transpose;
            const bandKey = h('span', { class: 'perform__band-key' });
            const reader = createReader(song, {
                shift: listKey, keyPill: false, chords: chordsShown, second: index > 0,
                onShift: () => paint(),
                onKey: (key) => {
                    bandKey.textContent = chordsShown ? key ?? '' : '';
                    bandKey.hidden = bandKey.textContent === '';
                    paint();
                },
            });
            const band = h('div', { class: 'perform__band' }, h('small', {}, entry.part.name), h('strong', {}, entry.song.title), bandKey);
            squares.push({ row: entry, song, listKey, reader, element: h('div', { class: 'perform__pane' }, band, reader.stage) });
        }
        // The tools of the lyrics are the selected song's: its size and display go in these slots
        const sizeSlot = h('div', { class: 'toolbar' });
        const displaySlot = h('div', { class: 'toolbar pub-tools__notation' });
        const bindTools = (): void => {
            sizeSlot.replaceChildren(selected().reader.size);
            displaySlot.replaceChildren(selected().reader.display);
        };
        // Notation, fit and columns are the visitor's own: the other square follows a change
        displaySlot.addEventListener('click', () => {
            for (const [index, square] of squares.entries()) {
                if (index !== focus) {
                    square.reader.syncPrefs();
                }
            }
        });
        down.addEventListener('click', () => selected().reader.setShift(selected().reader.shift() - 1));
        up.addEventListener('click', () => selected().reader.setShift(selected().reader.shift() + 1));
        keyButton.addEventListener('click', () => selected().reader.setShift(selected().listKey));
        bindTools();
        paint();

        const paintChords = (): void => {
            chordsSwitch.setAttribute('aria-checked', String(chordsShown));
            chordsSwitch.querySelector('.switch')?.classList.toggle('is-on', chordsShown);
            paint();
        };
        chordsSwitch.addEventListener('click', () => {
            chordsShown = !chordsShown;
            saveChords(chordsShown);
            for (const square of squares) {
                square.reader.setChords(chordsShown);
            }
            paintChords();
        });

        const print = (version: PrintVersion): void => {
            const { song, reader, row: current } = selected();
            printPlans([planSheet(song, { version, shift: reader.shift(), notation: readNotation(), part: current.part.name })], song.title).catch(() => undefined);
        };

        // --- the bar: back to the list, where this song is, the neighbours and the tools ---
        const go = (n: number): void => {
            if (n < 1 || n > rows.length) {
                return;
            }
            slideFrom = n > row.n ? 'next' : 'previous';
            history.pushState(null, '', paths.shared(code, n));
            render();
        };
        /** To the page before or after this one, on its first song */
        const goPage = (by: -1 | 1): void => {
            const target = pages[pageIndex + by]?.[0];
            const to = target === undefined ? undefined : rows.find((entry) => entry.item.id === target.id);
            if (to !== undefined) {
                go(to.n);
            }
        };
        const toolsButton = h('button', { type: 'button', class: 'perform__more pub-bar__tools', 'aria-label': 'Herramientas', 'aria-expanded': 'false', 'aria-controls': 'pub-tools' }, icon('more', 22));
        const fold = h('button', { type: 'button', class: 'pub-tools__tab', 'aria-label': 'Plegar las herramientas' }, h('span', { class: 'pub-fold__grip' }, icon('chevron-up', 16)));
        const tools = h('div', { class: 'pub-tools', id: 'pub-tools', hidden: true, role: 'toolbar', 'aria-label': 'Herramientas de la letra' },
            h('div', { class: 'pub-tools__group' }, down, keyButton, up),
            h('div', { class: 'pub-tools__group' }, sizeSlot, displaySlot, printMenu(print)),
            listenTool, chordsSwitch, fold);
        const setTools = (shown: boolean): void => {
            tools.hidden = !shown;
            toolsButton.setAttribute('aria-expanded', String(shown));
        };
        toolsButton.addEventListener('click', () => setTools(tools.hidden));
        fold.addEventListener('click', () => setTools(false));
        // The same bar as when singing a list: the way back, the section and "Song • Key", the position that opens the songs, and "⋯" for the tools
        const jumpButton = h('button', { type: 'button', class: 'perform__jump', 'aria-label': `Ir a otro canto. ${divided ? 'Cantos' : 'Canto'} ${row.n} de ${rows.length}` },
            countText, icon('chevron-down', 16));
        const bar = h('div', { class: 'pub-bar' },
            ...(single ? [] : [h('a', { class: 'pub-bar__button', href: paths.shared(code), 'data-link': true, 'aria-label': `Volver al listado: ${data.title}` }, icon('arrow-left', 22))]),
            h('span', { class: 'pub-bar__text' }, barPart, h('span', { class: 'pub-bar__line' }, barTitle, barKey)),
            ...(single ? [] : [jumpButton]), toolsButton);

        // --- the squares: one stage alone, or two with a band each (side by side on a wide screen, one over the other otherwise) ---
        const panesEl = h('div', { class: `perform__panes${divided ? ' is-split' : ''}`, 'data-layout': 'column' }, ...squares.map((square) => square.element));
        const layoutObserver = new ResizeObserver(() => {
            panesEl.dataset['layout'] = squaresLayout(panesEl.clientWidth, panesEl.clientHeight);
        });
        layoutObserver.observe(panesEl);
        const select = (index: number): void => {
            if (!divided || index === focus) {
                return;
            }
            focus = index;
            // The address names the selected song, so a reload returns to the same one
            history.replaceState(null, '', paths.shared(code, selected().row.n));
            for (const [at, square] of squares.entries()) {
                square.element.classList.toggle('is-focus', at === focus);
            }
            bindTools();
            paint();
        };
        for (const [index, square] of squares.entries()) {
            square.element.classList.toggle('is-focus', divided && index === focus);
            square.element.addEventListener('click', () => select(index));
        }

        // --- the position button: the songs of the list, to jump to one ---
        const jumpSheet = createSheet('Cantos del listado');
        const songList = h('ul', { class: 'perform__songs' }, ...rows.map((entry) => {
            const choice = h('button', { type: 'button', class: 'perform__song-choice' },
                h('span', { class: 'perform__song-number' }, String(entry.n)),
                h('span', {}, h('small', {}, entry.part.name), entry.song.title));
            if (pageRows.some((onPage) => onPage.n === entry.n)) {
                choice.setAttribute('aria-current', 'true');
            }
            choice.addEventListener('click', () => jumpSheet.close(() => {
                const onPage = pageRows.findIndex((candidate) => candidate.n === entry.n);
                if (onPage >= 0) {
                    select(onPage);
                } else {
                    go(entry.n);
                }
            }));

            return h('li', {}, choice);
        }));
        jumpSheet.body.append(h('h3', {}, 'Cantos del listado'), songList);
        jumpButton.addEventListener('click', jumpSheet.open);

        // --- the page follows the finger from the first sideways move, as when singing a list ---
        const slideEl = (): HTMLElement => (divided ? panesEl : (squares[0] as Square).reader.stage);
        if (slideFrom !== null) {
            slideEl().classList.add(`slide-in-${slideFrom}`);
            slideFrom = null;
        }
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let start: { x: number; y: number } | null = null;
        let axis: Axis | null = null;
        const hasPageOn = (dx: number): boolean => pages[pageIndex + (dx < 0 ? 1 : -1)] !== undefined;
        const place = (offset: number): void => {
            const moving = slideEl();
            moving.style.transition = 'none';
            moving.style.transform = `translateX(${offset}px)`;
            moving.style.opacity = String(1 - Math.min(Math.abs(offset) / moving.clientWidth, 1) * 0.6);
        };
        const settle = (offset: number, opacity: number, then?: () => void): void => {
            const moving = slideEl();
            moving.style.transition = reduceMotion ? 'none' : `transform ${EXIT_TIME}ms ease-out, opacity ${EXIT_TIME}ms ease-out`;
            moving.style.transform = offset === 0 ? '' : `translateX(${offset}px)`;
            moving.style.opacity = opacity === 1 ? '' : String(opacity);
            if (then !== undefined) {
                setTimeout(then, reduceMotion ? 0 : EXIT_TIME);
            }
        };
        panesEl.addEventListener('touchstart', (event) => {
            const touch = event.touches[0];
            start = event.touches.length === 1 && touch !== undefined ? { x: touch.clientX, y: touch.clientY } : null;
            axis = null;
        }, { passive: true });
        panesEl.addEventListener('touchmove', (event) => {
            const touch = event.touches[0];
            if (start === null || touch === undefined) {
                return;
            }
            const dx = touch.clientX - start.x;
            axis ??= swipeAxis(dx, touch.clientY - start.y);
            if (axis === 'x') {
                slideEl().classList.remove('slide-in-next', 'slide-in-previous');
                place(dragOffset(dx, hasPageOn(dx)));
            }
        }, { passive: true });
        panesEl.addEventListener('touchcancel', () => {
            start = null;
            if (axis === 'x') {
                settle(0, 1);
            }
            axis = null;
        }, { passive: true });
        panesEl.addEventListener('touchend', (event) => {
            const touch = event.changedTouches[0];
            if (start === null || touch === undefined) {
                return;
            }
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            start = null;
            axis = null;
            if (isSwipe(dx, dy) && hasPageOn(dx)) {
                settle(Math.sign(dx) * panesEl.clientWidth * EXIT_DISTANCE, 0, () => goPage(dx < 0 ? 1 : -1));
            } else {
                settle(0, 1);
            }
        }, { passive: true });

        // --- the bar folds to a thin strip (the title, the key, the position) while the lyrics scroll down, as when singing a list;
        // a divided page keeps it open ---
        const strip = h('button', { type: 'button', class: 'pub-strip', 'aria-label': 'Mostrar la barra' }, stripTitle, stripKey, ...(single ? [] : [stripCount]));
        strip.inert = true;
        const chrome = h('div', { class: 'pub-chrome' }, bar, strip);
        let barFold: FoldState = { folded: false, anchor: 0 };
        const setFolded = (folded: boolean): void => {
            chrome.classList.toggle('is-folded', folded);
            bar.inert = folded;
            strip.inert = !folded;
            if (folded) {
                setTools(false);
            }
        };
        const lone = (squares[0] as Square).reader.stage;
        if (!divided) {
            lone.addEventListener('scroll', () => {
                const next = nextFold(barFold, lone.scrollTop, barFoldPoint());
                if (next.folded !== barFold.folded) {
                    setFolded(next.folded);
                }
                barFold = next;
            }, { passive: true });
            strip.addEventListener('click', () => {
                setFolded(false);
                barFold = { folded: false, anchor: lone.scrollTop };
            });
        }
        paint();

        show(h('div', { class: `pub-song${divided ? ' is-divided' : ''}` }, panesEl, chrome, tools, jumpSheet.element, listenSheet.element));
        // After `show`, which clears what belonged to the screen before
        // The arrow keys leave the song alone while the list of songs is open
        navigate = {
            previous: () => !jumpSheet.isOpen() && goPage(-1),
            next: () => !jumpSheet.isOpen() && goPage(1),
        };
        dispose = () => {
            layoutObserver.disconnect();
            for (const square of squares) {
                square.reader.dispose();
            }
            jumpSheet.release();
            listenSheet.release();
        };
    };

    /** The page the address asks for: the list, or one of its songs when the lyrics are shared */
    const render = (): void => {
        if (list === null) {
            return;
        }
        document.title = `${list.title} · Músicos Católicos`;
        const route = matchRoute(location.pathname);
        const rows = readingOrder(list);
        // A shared song is its one page, whatever number the address carries
        const row = list.kind === 'song'
            ? rows[0]
            : route.name === 'shared' && route.n !== undefined && list.withLyrics ? rows.find((candidate) => candidate.n === route.n) : undefined;
        if (row === undefined) {
            listPage(list);
        } else {
            songPage(list, row, rows);
        }
    };

    const load = (): void => {
        document.title = 'Enlace compartido · Músicos Católicos';
        show(h('p', { class: 'pub-wait', role: 'status' }, h('span', { class: 'spinner spinner--big', 'aria-hidden': 'true' }), 'Abriendo el enlace…'));
        readShared(code)
            .then(async (data) => {
                list = data;
                fromCopy = null;
                render();
                // Kept on this device so it opens with no connection; nobody waits for it
                await copies.save(code, data);
            })
            .catch(async (failure: unknown) => {
                const retry = h('button', { type: 'button', class: 'button' }, 'Reintentar');
                retry.addEventListener('click', load);
                if (failure instanceof ApiError && failure.status === 404) {
                    // The link was stopped: what was kept of it goes too
                    await copies.remove(code);
                    list = null;
                    show(header(), h('main', { class: 'pub-main' }, h('div', { class: 'pub-wrap' },
                        message('Este enlace ya no existe', h('p', {}, 'Quien lo compartió pudo haberlo apagado. Pídele uno nuevo.')))));

                    return;
                }
                const offline = failure instanceof ApiError && failure.isOffline;
                const kept = await copies.load(code);
                if (kept !== undefined) {
                    list = kept.list;
                    fromCopy = { offline, savedAt: kept.savedAt };
                    render();

                    return;
                }
                show(header(), h('main', { class: 'pub-main' }, h('div', { class: 'pub-wrap' }, offline
                    ? message('Sin conexión', h('p', {}, 'Este enlace todavía no está guardado en este dispositivo. Conéctate para abrirlo; después se podrá leer sin conexión.'), retry)
                    : message('No se pudo abrir el enlace', h('p', {}, failure instanceof Error ? failure.message : 'Inténtalo de nuevo.'), retry))));
            });
    };

    // The addresses of the list and of its songs are real: a link moves inside the page, back and reload work
    root.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-link]');
        if (anchor !== null && anchor.origin === location.origin) {
            event.preventDefault();
            history.pushState(null, '', anchor.pathname);
            render();
        }
    });
    window.addEventListener('popstate', () => {
        // The back button first closes a sheet that is open (and runs what its choice asked for), as everywhere in the app
        if (!dismissSheetOnBack()) {
            render();
        }
    });
    // On a computer the arrow keys change the song, as they do when singing
    document.addEventListener('keydown', (event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (event.key === 'ArrowLeft') {
            navigate?.previous();
        } else if (event.key === 'ArrowRight') {
            navigate?.next();
        }
    });
    load();
}
