import type { App } from '../app.ts';
import { inMassOrder } from '../data/setlists.ts';
import type { Setlist, SetlistItem, Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { nextFold, type FoldState } from '../fold.ts';
import { MASS_PARTS } from '../mass.ts';
import { readKeepAwake } from '../prefs.ts';
import { todayKeys } from '../today-keys.ts';
import { showToast } from '../toast.ts';
import { paths } from '../router.ts';
import { dragOffset, isSwipe, swipeAxis, type Axis } from '../swipe.ts';
import { describeAwake, screenKeeper } from '../wakelock.ts';
import { createReader, type Reader } from './reader.ts';
import { createSheet } from './sheet.ts';
import { createToneControl, type ToneControl } from './tone-control.ts';
import type { Navigate, View } from './types.ts';

/** How long (ms) the song takes to leave the screen once the finger lets go */
const EXIT_TIME = 140;

/** How far, as a share of the stage's width, the song travels as it leaves */
const EXIT_DISTANCE = 0.35;

/**
 * Which way the last move went, so the next song slides in from that side. The view is made
 * anew for every song, so this has to outlive it; it is read once, by the view that follows.
 */
let slideFrom: 'next' | 'previous' | null = null;

/** The part of the Mass an item belongs to, by name */
function partName(item: SetlistItem): string {
    return MASS_PARTS.find((part) => part.id === item.part)?.name ?? 'Otra parte';
}

/**
 * Singing a setlist: the songs in the order of the Mass, one at a time, big. Between songs by a
 * swipe (the song follows the finger), the arrow keys, or the position button, which lists them all.
 * The key a song is read in is the one of its item, or the one of today if there is one: − and + in
 * "⋯" only change it for today (kept on this device, expiring the next morning) and "Guardar" leaves
 * it in the item, "for this list". Everything comes from the device, so it works with no connection.
 *
 * The bar floats over the lyrics (so folding it never moves them): one row with the way back, the
 * song, its position and "⋯" for every other tool; it folds to a thin strip with the song and its key
 * while the lyrics scroll down, and unfolds on scroll up or a tap.
 *
 * @param n 1-based position in the order of the Mass; out of range is brought into range
 */
export async function performView(app: App, navigate: Navigate, setlist: Setlist, n: number): Promise<View> {
    const order = inMassOrder(setlist.items);
    if (order.length === 0) {
        const back = link(paths.setlist(setlist.id), '← Listado', 'button back');
        const empty = h('div', { class: 'page' }, h('p', { class: 'card' }, 'Este listado no tiene cantos todavía.'), h('div', { class: 'actions' }, back));

        return { element: empty };
    }

    const position = Math.min(Math.max(n, 1), order.length);
    if (position !== n) {
        // The address named a song that is not there (the list shrank): show the nearest one
        history.replaceState(history.state, '', paths.perform(setlist.id, position));
    }
    const item = order[position - 1] as SetlistItem;
    const song: Song | undefined = await app.get(item.songId);
    const title = song?.title ?? 'Canto eliminado';
    const countText = `${position}/${order.length}`;

    const go = (to: number): void => {
        if (to >= 1 && to <= order.length && to !== position) {
            slideFrom = to > position ? 'next' : 'previous';
            navigate(paths.perform(setlist.id, to), { replace: true });
        }
    };

    // --- the bar: full row, and the strip it folds to ---
    const back = link(paths.setlist(setlist.id), '←', 'perform__back');
    back.setAttribute('aria-label', 'Volver al listado');
    const heading = h('span', { class: 'perform__title' }, h('small', { class: 'perform__part' }, partName(item)), h('strong', { class: 'perform__song' }, title));
    const jumpButton = h('button', { type: 'button', class: 'perform__jump', 'aria-label': `Ir a otro canto. Canto ${position} de ${order.length}` },
        h('span', { class: 'perform__count' }, countText), ' ▾');
    const moreButton = h('button', { type: 'button', class: 'perform__more', 'aria-label': 'Más herramientas' }, '⋯');
    const full = h('div', { class: 'perform__full' }, back, heading, jumpButton, moreButton);
    const stripKey = h('span', { class: 'perform__strip-key' });
    const strip = h('button', { type: 'button', class: 'perform__strip', 'aria-label': 'Mostrar la barra' },
        h('strong', {}, title), stripKey, h('span', { class: 'perform__strip-count' }, countText));
    strip.inert = true;
    const progress = h('div', { class: 'perform__progress', 'aria-hidden': 'true' });
    const error = h('p', { class: 'error', role: 'alert' });
    const chrome = h('div', { class: 'perform__chrome' }, progress, full, strip, error);

    // --- the song ---
    let stage: HTMLElement;
    let tools: HTMLElement | null = null;
    let tone: ToneControl | null = null;
    let dispose: () => void = () => undefined;
    if (song === undefined) {
        stage = h(
            'div',
            { class: 'stage is-scroll-stage' },
            h('div', { class: 'viewer-content' }, h('h2', {}, 'Canto eliminado'), h('p', {}, 'Este canto ya no está en la biblioteca. Quítalo del listado o sigue con el siguiente.')),
        );
    } else {
        /** The key saved in the list for this song (it changes when the person saves) */
        let saved = item.transpose;
        let today = todayKeys.get(setlist.id, item.id);
        if (today === saved) {
            // The list was changed to the key of today (on another device, say): nothing is left to remember
            todayKeys.clear(setlist.id, item.id);
            today = null;
        }
        let reader: Reader | undefined;
        const markStrip = (): void => {
            stripKey.classList.toggle('is-today', reader !== undefined && reader.shift() !== saved);
        };
        reader = createReader(song, {
            sizeScope: 'setlist',
            shift: today ?? saved,
            externalTone: true,
            onShift: (shift) => {
                error.textContent = '';
                if (shift === saved) {
                    todayKeys.clear(setlist.id, item.id);
                } else {
                    todayKeys.set(setlist.id, item.id, shift);
                }
                markStrip();
            },
            onKey: (key) => {
                stripKey.textContent = key ?? '';
                markStrip();
                tone?.refresh();
            },
        });
        const own = reader;
        markStrip();
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
            markStrip();

            return true;
        };
        const writeMine = async (shift: number): Promise<boolean> => {
            try {
                await app.setMyShift(song.id, shift);
            } catch (failure) {
                return fail(failure, 'No se pudo guardar tu tono.');
            }
            mine = shift;

            return true;
        };
        /** Saves where `where` says and tells the person where it went */
        const saveTo = (where: { list: boolean; mine: boolean }, said: string) => async (shift: number): Promise<void> => {
            error.textContent = '';
            if ((where.list && !(await writeList(shift))) || (where.mine && !(await writeMine(shift)))) {
                return;
            }
            showToast(said, 3500, true);
        };
        tone = createToneControl({
            reader: own,
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
        });
        tools = own.toolbar;
        stage = own.stage;
        dispose = own.dispose;
    }

    // --- "⋯": the key and the lyrics tools ---
    const toolsSheet = createSheet('Tono y letra');
    if (tools !== null && tone !== null) {
        toolsSheet.body.append(h('h3', {}, 'Tono'), tone.element, h('h3', {}, 'Letra'), tools);
    }
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
        const known = new Map((await app.list()).map((candidate) => [candidate.id, candidate.title]));
        songList.replaceChildren(...order.map((entry, index) => {
            const choice = h('button', { type: 'button', class: 'perform__song-choice' },
                h('span', { class: 'perform__song-number' }, String(index + 1)),
                h('span', {}, h('small', {}, partName(entry)), known.get(entry.songId) ?? 'Canto eliminado'));
            if (index + 1 === position) {
                choice.setAttribute('aria-current', 'true');
                current = choice;
            }
            choice.addEventListener('click', () => jumpSheet.close(() => go(index + 1)));

            return h('li', {}, choice);
        }));
        if (current !== null) {
            jumpSheet.reveal(current);
        }
    });
    jumpSheet.body.append(h('h3', {}, 'Cantos del listado, en el orden de la misa'), songList);
    jumpButton.addEventListener('click', jumpSheet.open);

    // --- moving between songs without leaving the page ---
    const onKey = (key: KeyboardEvent): void => {
        const target = key.target as HTMLElement;
        if (key.altKey || key.ctrlKey || key.metaKey || key.shiftKey || /^(input|textarea|select)$/i.test(target.tagName) || toolsSheet.isOpen() || jumpSheet.isOpen()) {
            return;
        }
        if (key.key === 'ArrowLeft') {
            go(position - 1);
        } else if (key.key === 'ArrowRight') {
            go(position + 1);
        }
    };
    document.addEventListener('keydown', onKey);

    // The song follows the finger from the first sideways move; letting go past SWIPE_MIN carries it
    // off the screen and the next one slides in, otherwise it springs back
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let start: { x: number; y: number } | null = null;
    let axis: Axis | null = null;
    const hasSongOn = (dx: number): boolean => (dx < 0 ? position < order.length : position > 1);
    const place = (offset: number): void => {
        stage.style.transition = 'none';
        stage.style.transform = `translateX(${offset}px)`;
        stage.style.opacity = String(1 - Math.min(Math.abs(offset) / stage.clientWidth, 1) * 0.6);
    };
    const settle = (offset: number, opacity: number, then?: () => void): void => {
        stage.style.transition = reduceMotion ? 'none' : `transform ${EXIT_TIME}ms ease-out, opacity ${EXIT_TIME}ms ease-out`;
        stage.style.transform = offset === 0 ? '' : `translateX(${offset}px)`;
        stage.style.opacity = opacity === 1 ? '' : String(opacity);
        if (then !== undefined) {
            setTimeout(then, reduceMotion ? 0 : EXIT_TIME);
        }
    };
    stage.addEventListener('touchstart', (touchEvent) => {
        const touch = touchEvent.touches[0];
        start = touchEvent.touches.length === 1 && touch !== undefined ? { x: touch.clientX, y: touch.clientY } : null;
        axis = null;
    }, { passive: true });
    stage.addEventListener('touchmove', (touchEvent) => {
        const touch = touchEvent.touches[0];
        if (start === null || touch === undefined) {
            return;
        }
        const dx = touch.clientX - start.x;
        axis ??= swipeAxis(dx, touch.clientY - start.y);
        if (axis === 'x') {
            stage.classList.remove('slide-in-next', 'slide-in-previous');
            place(dragOffset(dx, hasSongOn(dx)));
        }
    }, { passive: true });
    stage.addEventListener('touchcancel', () => {
        start = null;
        if (axis === 'x') {
            settle(0, 1);
        }
        axis = null;
    }, { passive: true });
    stage.addEventListener('touchend', (touchEvent) => {
        const touch = touchEvent.changedTouches[0];
        if (start === null || touch === undefined) {
            return;
        }
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        start = null;
        axis = null;
        if (isSwipe(dx, dy) && hasSongOn(dx)) {
            settle(Math.sign(dx) * stage.clientWidth * EXIT_DISTANCE, 0, () => go(dx < 0 ? position + 1 : position - 1));
        } else {
            settle(0, 1);
        }
    }, { passive: true });

    if (slideFrom !== null) {
        stage.classList.add(`slide-in-${slideFrom}`);
        slideFrom = null;
    }

    // --- folding the bar while the lyrics scroll down ---
    let fold: FoldState = { folded: false, anchor: 0 };
    const setFolded = (folded: boolean): void => {
        chrome.classList.toggle('is-folded', folded);
        full.inert = folded;
        strip.inert = !folded;
    };
    stage.addEventListener('scroll', () => {
        const top = stage.scrollTop;
        const room = stage.scrollHeight - stage.clientHeight;
        progress.style.transform = `scaleX(${room > 0 ? Math.min(top / room, 1) : 0})`;
        const next = nextFold(fold, top);
        if (next.folded !== fold.folded) {
            setFolded(next.folded);
        }
        fold = next;
    }, { passive: true });
    strip.addEventListener('click', () => {
        setFolded(false);
        fold = { folded: false, anchor: stage.scrollTop };
    });

    return {
        element: h('div', { class: 'viewer perform' }, stage, chrome, jumpSheet.element, toolsSheet.element),
        dispose: () => {
            document.removeEventListener('keydown', onKey);
            toolsSheet.release();
            jumpSheet.release();
            stopAwake();
            releaseScreen();
            dispose();
        },
    };
}
