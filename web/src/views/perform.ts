import type { App } from '../app.ts';
import { canJoin, pageIndexOf, pagesOf, positionText, squaresLayout } from '../data/pages.ts';
import { inListOrder, partName } from '../data/setlists.ts';
import type { Setlist, SetlistItem, Song } from '../data/types.ts';
import { draftTag, h, link } from '../dom.ts';
import { icon } from '../icons.ts';
import { printSong } from '../print/jobs.ts';
import type { PrintVersion } from '../print/layout.ts';
import { barFoldPoint, nextFold, type FoldState } from '../fold.ts';
import { readKeepAwake } from '../prefs.ts';
import { todayKeys } from '../today-keys.ts';
import { showToast } from '../toast.ts';
import { paths } from '../router.ts';
import { dragOffset, isSwipe, swipeAxis, type Axis } from '../swipe.ts';
import { describeAwake, screenKeeper } from '../wakelock.ts';
import { createReader, type Reader } from './reader.ts';
import { createListenSheet, listenAction, listenableOf } from './listen.ts';
import { createSheet, sheetAction, sheetList, spaced } from './sheet.ts';
import { createToneControl, type ToneControl, type ToneControlOptions } from './tone-control.ts';
import type { Navigate, View } from './types.ts';

/** How long (ms) the song takes to leave the screen once the finger lets go */
const EXIT_TIME = 140;

/** How far, as a share of the stage's width, the song travels as it leaves */
const EXIT_DISTANCE = 0.35;

/**
 * Which way the last move went, so the next song slides in from that side. The view is made
 * anew for every page, so this has to outlive it; it is read once, by the view that follows.
 */
let slideFrom: 'next' | 'previous' | null = null;

/** The section of the list an item belongs to, by name */
function sectionName(setlist: Setlist, item: SetlistItem): string {
    return partName(setlist, item.part) ?? 'Otra sección';
}

/** One song on the screen: its square (alone, or one of two on a divided page) and everything that answers to its key */
interface Pane {
    item: SetlistItem;
    song: Song | undefined;
    /** Where the song stands in the order of the list, from 1 */
    position: number;
    /** The square: its band (only on a divided page) and the stage the lyrics are drawn in */
    element: HTMLElement;
    stage: HTMLElement;
    reader?: Reader;
    /** The key control of the "⋯" sheet */
    tone?: ToneControl;
    /** Its − key + goes in the bar and its Guardar in the dock */
    barTone?: ToneControl;
    /** What the dock says while this song's key is only for today */
    dock: HTMLElement;
    /** The key is not the one saved in the list */
    changed: () => boolean;
    /** The key on screen now, in semitones from the song's own (today's included) */
    shiftNow: () => number;
    /** The key on screen, in the notation shown (null when the song has none) */
    key: string | null;
    /** Draws what shows the key again: the band, the dock */
    mark: () => void;
}

/**
 * Singing a setlist: the songs in the order of the Mass, a page at a time, big. A page is one song, or two when the
 * person divided it (`Setlist` item `withNext`): then each is in a square of its own, side by side on a screen wider than
 * tall and one over the other otherwise. Between pages by a swipe (the page follows the finger), the arrow keys, or
 * the position button, which lists the songs. The bar speaks of the selected song (the one touched; the first at
 * the start) and so do the key controls: − and + only change its key for today (kept on this device, expiring the next
 * morning), and while it is not the one saved a row at the foot says so, with "Deshacer" and "Guardar"; Guardar
 * leaves it in the item ("for this list") or as "mi tono". Everything comes from the device, so it works with no connection.
 *
 * The bar floats over the lyrics (so folding it never moves them): one row with the way back, the
 * song, its position and "⋯" for every other tool; it folds to a thin strip with the song and its key
 * while the lyrics scroll down, and unfolds on scroll up or a tap. A divided page keeps the bar open.
 *
 * @param n 1-based position in the order of the Mass of the song to start on; out of range is brought into range
 */
export async function performView(app: App, navigate: Navigate, setlist: Setlist, n: number): Promise<View> {
    const order = inListOrder(setlist);
    if (order.length === 0) {
        const back = link(paths.setlist(setlist.id), '', 'button back');
        back.replaceChildren(icon('arrow-left', 18), 'Listado');
        const empty = h('div', { class: 'page' }, h('p', { class: 'card' }, 'Este listado no tiene cantos todavía.'), h('div', { class: 'actions' }, back));

        return { element: empty };
    }

    const position = Math.min(Math.max(n, 1), order.length);
    if (position !== n) {
        // The address named a song that is not there (the list shrank): show the nearest one
        history.replaceState(history.state, '', paths.perform(setlist.id, position));
    }
    const pages = pagesOf(order);
    const pageIndex = pageIndexOf(pages, (order[position - 1] as SetlistItem).id);
    const page = pages[pageIndex] as SetlistItem[];
    const divided = page.length === 2;
    const songs = await Promise.all(page.map((entry) => app.get(entry.songId)));
    const positionOf = (item: SetlistItem): number => order.findIndex((candidate) => candidate.id === item.id) + 1;

    const goTo = (to: number, direction: 'next' | 'previous' | null): void => {
        slideFrom = direction;
        navigate(paths.perform(setlist.id, to), { replace: true });
    };
    /** To the page before or after this one, on its first song */
    const goPage = (by: -1 | 1): void => {
        const target = pages[pageIndex + by];
        if (target !== undefined) {
            goTo(positionOf(target[0] as SetlistItem), by > 0 ? 'next' : 'previous');
        }
    };

    // --- the bar: full row, and the strip it folds to; both speak of the selected song ---
    const back = link(paths.setlist(setlist.id), '', 'perform__back');
    back.append(icon('arrow-left', 22));
    back.setAttribute('aria-label', 'Volver al listado');
    // The title and the key say it all here: the head of the song (title, author, key) is not repeated under the bar
    const barSection = h('small', { class: 'perform__part' });
    const barName = h('span', { class: 'perform__song-name' });
    const barKey = h('span', { class: 'perform__song-key' });
    barKey.hidden = true;
    const barTag = h('span', { class: 'perform__tag' });
    const heading = h('span', { class: 'perform__title' }, barSection, h('strong', { class: 'perform__song' }, barName, barKey, barTag));
    const countText = h('span', { class: 'perform__count' });
    const jumpButton = h('button', { type: 'button', class: 'perform__jump' }, countText, icon('chevron-down', 16));
    const moreButton = h('button', { type: 'button', class: 'perform__more', 'aria-label': 'Más herramientas' }, icon('more', 22));
    // On a wide screen the key's − / + rides in the bar, before the position button; the selected song's goes in
    const toneSlot = h('div', { class: 'perform__tone' });
    const full = h('div', { class: 'perform__full' }, back, heading, toneSlot, jumpButton, moreButton);
    const stripName = h('strong', {});
    const stripKey = h('span', { class: 'perform__strip-key' });
    const stripTag = h('span', { class: 'perform__tag' });
    const stripCount = h('span', { class: 'perform__strip-count' });
    const strip = h('button', { type: 'button', class: 'perform__strip', 'aria-label': 'Mostrar la barra' }, stripName, stripKey, stripTag, stripCount);
    strip.inert = true;
    const progress = h('div', { class: 'perform__progress', 'aria-hidden': 'true' });
    const error = h('p', { class: 'error', role: 'alert' });
    const chrome = h('div', { class: 'perform__chrome' }, progress, full, strip, error);
    /** The row at the foot while the selected song's key is only for today */
    const dock = h('div', { class: 'perform__dock', role: 'status', hidden: true });

    // --- the songs of the page, each in its square ---
    const panes: Pane[] = [];
    /** The selected song: the one the bar and the key controls speak of */
    let focus = Math.max(0, page.findIndex((entry) => entry.id === (order[position - 1] as SetlistItem).id));
    const focused = (): Pane => panes[focus] as Pane;

    /** Draws the bar, the dock and the position button from the selected song */
    const paint = (): void => {
        const pane = focused();
        const title = pane.song?.title ?? 'Canto eliminado';
        barSection.textContent = sectionName(setlist, pane.item);
        barName.textContent = title;
        barKey.textContent = pane.key ?? '';
        barKey.hidden = pane.key === null;
        barKey.classList.toggle('is-today', pane.changed());
        barTag.replaceChildren(...(pane.song === undefined ? [] : draftTag(pane.song)));
        stripName.textContent = title;
        stripKey.textContent = pane.key ?? '';
        stripKey.classList.toggle('is-today', pane.changed());
        stripTag.replaceChildren(...(pane.song === undefined ? [] : draftTag(pane.song)));
        const where = positionText(order, page);
        countText.textContent = where;
        stripCount.textContent = where;
        jumpButton.setAttribute('aria-label', `Ir a otro canto. ${divided ? 'Cantos' : 'Canto'} ${where.replace('/', ' de ')}`);
        if (pane.barTone !== undefined) {
            toneSlot.replaceChildren(pane.barTone.step);
        } else {
            toneSlot.replaceChildren();
        }
        dock.replaceChildren(pane.dock);
        dock.hidden = !pane.changed();
        for (const [index, other] of panes.entries()) {
            other.element.classList.toggle('is-focus', divided && index === focus);
        }
    };

    const makePane = (index: number): Pane => {
        const item = page[index] as SetlistItem;
        const song = songs[index];
        const second = index > 0;
        const element = h('div', { class: 'perform__pane' });
        const dockBody = h('div', { class: 'perform__dock-body' });
        const pane: Pane = {
            item, song, position: positionOf(item), element, stage: element, dock: dockBody,
            changed: () => false, shiftNow: () => item.transpose, key: null, mark: () => undefined,
        };
        // The band: only a divided page has one; the section small, then the song and its key, in one line
        const bandKey = h('span', { class: 'perform__band-key' });
        bandKey.hidden = true;
        const band = h('div', { class: 'perform__band' },
            h('small', {}, sectionName(setlist, item)),
            h('strong', {}, song?.title ?? 'Canto eliminado'), bandKey, ...(song === undefined ? [] : draftTag(song)));
        if (song === undefined) {
            pane.stage = h(
                'div',
                { class: 'stage is-scroll-stage' },
                h('div', { class: 'viewer-content' }, h('h2', {}, 'Canto eliminado'), h('p', {}, 'Este canto ya no está en la biblioteca. Quítalo del listado o sigue con el siguiente.')),
            );
            element.append(band, pane.stage);

            return pane;
        }

        /** The key saved in the list for this song (it changes when the person saves) */
        let saved = item.transpose;
        let today = todayKeys.get(setlist.id, item.id);
        if (today === saved) {
            // The list was changed to the key of today (on another device, say): nothing is left to remember
            todayKeys.clear(setlist.id, item.id);
            today = null;
        }
        const dockKey = h('span', { class: 'perform__dock-key' });
        const reader: Reader = createReader(song, {
            songHead: false,
            keyPill: false,
            shift: today ?? saved,
            second,
            onShift: (shift) => {
                error.textContent = '';
                if (shift === saved) {
                    todayKeys.clear(setlist.id, item.id);
                } else {
                    todayKeys.set(setlist.id, item.id, shift);
                }
                pane.mark();
            },
            onKey: (key) => {
                pane.key = key;
                bandKey.textContent = key ?? '';
                bandKey.hidden = key === null;
                dockKey.textContent = key ?? '';
                pane.tone?.refresh();
                pane.barTone?.refresh();
                pane.mark();
            },
        });
        pane.reader = reader;
        pane.stage = reader.stage;
        pane.changed = () => reader.shift() !== saved;
        pane.shiftNow = () => reader.shift();
        pane.mark = () => {
            bandKey.classList.toggle('is-today', pane.changed());
            dockKey.classList.toggle('is-today', pane.changed());
            if (panes[focus] === pane) {
                paint();
            }
        };
        /** The person's own key for this song ("mi tono"); the list's is `saved` */
        let mine = song.myShift;
        const fail = (failure: unknown, fallback: string): false => {
            error.textContent = failure instanceof Error ? failure.message : fallback;

            return false;
        };
        const writeList = async (shift: number): Promise<boolean> => {
            try {
                await app.setlists.setTranspose(setlist.id, item.id, shift);
            } catch (failure) {
                return fail(failure, 'No se pudo guardar el tono.');
            }
            saved = shift;
            todayKeys.clear(setlist.id, item.id);
            pane.mark();

            return true;
        };
        const writeMine = async (shift: number): Promise<boolean> => {
            try {
                await app.setMyShift(song.id, shift);
            } catch (failure) {
                return fail(failure, 'No se pudo guardar tu tono.');
            }
            mine = shift;
            // This use of the song follows "mi tono" unless the list fixed its own key: it may have moved with it
            const fresh = (await app.setlists.get(setlist.id))?.items.find((candidate) => candidate.id === item.id);
            if (fresh !== undefined && fresh.transpose !== saved) {
                saved = fresh.transpose;
                todayKeys.clear(setlist.id, item.id);
                pane.mark();
            }

            return true;
        };
        /** Saves where `where` says and tells the person where it went */
        const saveTo = (where: { list: boolean; mine: boolean }, said: string) => async (shift: number): Promise<void> => {
            error.textContent = '';
            if ((where.list && !(await writeList(shift))) || (where.mine && !(await writeMine(shift)))) {
                return;
            }
            showToast(said, 3500, true);
            // What was saved is the new "saved" key: both controls (the sheet's and the bar's) say so
            pane.tone?.refresh();
            pane.barTone?.refresh();
        };
        const toneOptions: ToneControlOptions = {
            reader,
            saved: () => saved,
            savedName: 'Listado',
            mine: () => mine,
            hint: 'Solo hoy',
            primaryLabel: 'Guardar',
            destinations: [
                { label: 'En este listado', save: saveTo({ list: true, mine: false }, 'Tono guardado en este listado') },
                { label: 'Como mi tono', save: saveTo({ list: false, mine: true }, 'Tono guardado como tu tono') },
                { label: 'En el listado y como mi tono', save: saveTo({ list: true, mine: true }, 'Tono guardado en este listado y como tu tono') },
            ],
        };
        pane.tone = createToneControl(toneOptions);
        pane.barTone = createToneControl({ ...toneOptions, compact: true, separateStep: true });

        const undo = h('button', { type: 'button', class: 'perform__dock-undo' }, 'Deshacer');
        undo.addEventListener('click', () => reader.setShift(saved));
        dockBody.append(
            dockKey, h('span', { class: 'perform__dock-hoy' }, 'hoy'),
            ...(divided ? [h('span', { class: 'perform__dock-who' }, sectionName(setlist, item))] : []),
            h('span', { class: 'perform__dock-gap' }), undo, pane.barTone.element,
        );
        element.append(band, reader.stage);
        pane.mark();

        return pane;
    };
    for (let index = 0; index < page.length; index++) {
        panes.push(makePane(index));
    }

    /** The squares: one stage alone, or two with a band each; the swipe moves them together */
    const panesEl = h('div', { class: `perform__panes${divided ? ' is-split' : ''}`, 'data-layout': 'column' }, ...panes.map((pane) => pane.element));
    /** What moves with the finger: the lone stage (as it always was) or both squares */
    const slideEl = (): HTMLElement => (divided ? panesEl : (panes[0] as Pane).stage);
    paint();

    const selectPane = (index: number): void => {
        if (!divided || index === focus) {
            return;
        }
        focus = index;
        // The address names the selected song, so a reload or the way back from editing it returns to the same one
        history.replaceState(history.state, '', paths.perform(setlist.id, focused().position));
        paint();
    };
    for (const [index, pane] of panes.entries()) {
        pane.element.addEventListener('click', () => selectPane(index));
    }
    // Side by side on a screen wider than tall, one over the other otherwise (the device's, never saved)
    const layoutObserver = new ResizeObserver(() => {
        panesEl.dataset['layout'] = squaresLayout(panesEl.clientWidth, panesEl.clientHeight);
    });
    layoutObserver.observe(panesEl);

    // --- "⋯": the key and the lyrics tools of the selected song, and dividing the page ---
    const toolsSheet = createSheet('Tono y letra', () => fillTools());
    // "Escuchar el original": the player of the song on screen, in a sheet that comes over the lyrics and goes away with them
    const listenSheet = createListenSheet();
    const fillTools = (): void => {
        const pane = focused();
        const { song, reader, tone } = pane;
        const divide = divided
            ? sheetAction('split', 'Separar los dos cantos', () => changePage(() => app.setlists.separate(setlist.id, pane.item.id)), { hint: 'Cada uno vuelve a su página' })
            : (() => {
                const check = canJoin(order, pane.item.id);

                return sheetAction('split', 'Dividir con el canto siguiente', () => changePage(() => app.setlists.joinWithNext(setlist.id, pane.item.id)), {
                    hint: check.ok ? 'Los dos se ven juntos, en una sola página' : check.reason,
                    disabled: !check.ok,
                });
            })();
        if (song === undefined || reader === undefined || tone === undefined) {
            toolsSheet.body.replaceChildren(spaced(sheetList(divide)));

            return;
        }
        // The lyrics and chords belong to the song, so the edit is the song's (it comes back here when it ends)
        const edit = h('button', { type: 'button', class: 'sheet-action' }, icon('pencil', 20),
            h('span', { class: 'sheet-action__text' }, 'Editar letra y acordes', h('small', {}, 'Se cambia en todos los listados donde está')));
        edit.addEventListener('click', () => toolsSheet.close(() => navigate(paths.edit(song.id, paths.perform(setlist.id, pane.position)))));
        // The key on screen, today's included; straight from the tap (a browser may refuse to print from anything later), then the sheet goes
        const print = (version: PrintVersion): void => {
            printSong(song, version, pane.shiftNow(), partName(setlist, pane.item.part))
                .catch(() => showToast('No se pudo preparar la impresión.', 4000, true));
            toolsSheet.close();
        };
        // Notation, fit and columns are the device's: the other square follows a change made here
        reader.toolbar.onclick = () => {
            for (const other of panes) {
                if (other !== pane) {
                    other.reader?.syncPrefs();
                }
            }
        };
        const heard = listenableOf(song);
        toolsSheet.body.replaceChildren(h('h3', {}, 'Tono'), tone.element, h('h3', {}, 'Letra'), reader.toolbar, spaced(sheetList(
            ...(heard === null ? [] : [listenAction(heard, () => toolsSheet.close(() => listenSheet.open(song)))]),
            divide,
            edit,
            sheetAction('printer', 'Imprimir con acordes', () => print('chords')),
            sheetAction('printer', 'Imprimir solo la letra', () => print('lyrics')),
        )));
    };
    /** Divides or separates the page, then draws it again from the list (the selected song stays selected) */
    const changePage = (change: () => Promise<unknown>): void => {
        toolsSheet.close(() => {
            change()
                .then(() => navigate(paths.perform(setlist.id, focused().position), { replace: true }))
                .catch((failure: unknown) => showToast(failure instanceof Error ? failure.message : 'No se pudo cambiar la página.', 4000, true));
        });
    };
    // The screen stays on while a song is on screen, unless the person turned that off in Ajustes. Nothing
    // on screen says so any more: only a failure is worth a word.
    const keepAwake = readKeepAwake();
    const releaseScreen = keepAwake ? screenKeeper.hold() : (): void => undefined;
    const stopAwake = screenKeeper.onChange((state) => {
        if (keepAwake && state === 'blocked') {
            showToast(describeAwake(true, 'blocked'), 6000, true);
        }
    });
    moreButton.addEventListener('click', toolsSheet.open);

    // --- the position button: the songs of the list, to jump to one ---
    const songList = h('ul', { class: 'perform__songs' });
    let current: HTMLElement | null = null;
    const jumpSheet = createSheet('Cantos del listado', async () => {
        const known = new Map((await app.list()).map((candidate) => [candidate.id, candidate]));
        songList.replaceChildren(...order.map((entry, index) => {
            const choice = h('button', { type: 'button', class: 'perform__song-choice' },
                h('span', { class: 'perform__song-number' }, String(index + 1)),
                h('span', {}, h('small', {}, sectionName(setlist, entry)), known.get(entry.songId)?.title ?? 'Canto eliminado',
                    ...(known.get(entry.songId) === undefined ? [] : draftTag(known.get(entry.songId) as Song))));
            if (page.some((onPage) => onPage.id === entry.id)) {
                choice.setAttribute('aria-current', 'true');
                current = choice;
            }
            choice.addEventListener('click', () => jumpSheet.close(() => {
                const onPage = page.findIndex((candidate) => candidate.id === entry.id);
                if (onPage >= 0) {
                    selectPane(onPage);
                } else {
                    goTo(index + 1, index + 1 > position ? 'next' : 'previous');
                }
            }));

            return h('li', {}, choice);
        }));
        if (current !== null) {
            jumpSheet.reveal(current);
        }
    });
    jumpSheet.body.append(h('h3', {}, 'Cantos del listado, en el orden de la misa'), songList);
    jumpButton.addEventListener('click', jumpSheet.open);

    // --- moving between pages without leaving the screen ---
    const onKey = (key: KeyboardEvent): void => {
        const target = key.target as HTMLElement;
        if (key.altKey || key.ctrlKey || key.metaKey || key.shiftKey || /^(input|textarea|select)$/i.test(target.tagName) || toolsSheet.isOpen() || jumpSheet.isOpen()) {
            return;
        }
        if (key.key === 'ArrowLeft') {
            goPage(-1);
        } else if (key.key === 'ArrowRight') {
            goPage(1);
        }
    };
    document.addEventListener('keydown', onKey);

    // The page follows the finger from the first sideways move; letting go past SWIPE_MIN carries it
    // off the screen and the next one slides in, otherwise it springs back
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
    panesEl.addEventListener('touchstart', (touchEvent) => {
        const touch = touchEvent.touches[0];
        start = touchEvent.touches.length === 1 && touch !== undefined ? { x: touch.clientX, y: touch.clientY } : null;
        axis = null;
    }, { passive: true });
    panesEl.addEventListener('touchmove', (touchEvent) => {
        const touch = touchEvent.touches[0];
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
    panesEl.addEventListener('touchend', (touchEvent) => {
        const touch = touchEvent.changedTouches[0];
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

    if (slideFrom !== null) {
        slideEl().classList.add(`slide-in-${slideFrom}`);
        slideFrom = null;
    }

    // --- folding the bar while the lyrics scroll down (a divided page keeps it open: its bands sit under it) ---
    const lone = panes[0] as Pane;
    let fold: FoldState = { folded: false, anchor: 0 };
    const setFolded = (folded: boolean): void => {
        chrome.classList.toggle('is-folded', folded);
        full.inert = folded;
        strip.inert = !folded;
    };
    if (!divided) {
        lone.stage.addEventListener('scroll', () => {
            const top = lone.stage.scrollTop;
            const room = lone.stage.scrollHeight - lone.stage.clientHeight;
            progress.style.transform = `scaleX(${room > 0 ? Math.min(top / room, 1) : 0})`;
            const next = nextFold(fold, top, barFoldPoint());
            if (next.folded !== fold.folded) {
                setFolded(next.folded);
            }
            fold = next;
        }, { passive: true });
        strip.addEventListener('click', () => {
            setFolded(false);
            fold = { folded: false, anchor: lone.stage.scrollTop };
        });
    }

    return {
        element: h('div', { class: `viewer perform${divided ? ' is-divided' : ''}` }, panesEl, dock, chrome, jumpSheet.element, toolsSheet.element, listenSheet.element),
        dispose: () => {
            document.removeEventListener('keydown', onKey);
            layoutObserver.disconnect();
            toolsSheet.release();
            listenSheet.release();
            jumpSheet.release();
            stopAwake();
            releaseScreen();
            for (const pane of panes) {
                pane.reader?.dispose();
            }
        },
    };
}
