import type { App } from '../app.ts';
import { inMassOrder } from '../data/setlists.ts';
import { LIMITS, type Setlist, type SetlistItem, type Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { MASS_PARTS } from '../mass.ts';
import { readMode, saveMode, type Mode } from '../prefs.ts';
import { paths } from '../router.ts';
import { createReader } from './reader.ts';
import type { Navigate, View } from './types.ts';

/** Scrolling this far (px) down hides the tools in event mode, this far up brings them back */
const HIDE_AFTER = 12;

/** A swipe is a mostly horizontal move at least this far (px) */
const SWIPE_MIN = 60;

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
 * Singing a setlist: the songs in the order of the Mass, one at a time, big. Next and previous
 * by the buttons, a swipe or the arrow keys. The key a song is read in is the one of its item;
 * changing it here is saved to the item (it is the same "for this list" change as in the list).
 * Everything comes from the device, so it works with no connection.
 *
 * @param n 1-based position in the order of the Mass; out of range is brought into range
 */
export async function performView(app: App, navigate: Navigate, setlist: Setlist, n: number): Promise<View> {
    const order = inMassOrder(setlist.items);
    const back = link(paths.setlist(setlist.id), '← Listado', 'button back');
    if (order.length === 0) {
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

    const go = (to: number): void => {
        if (to >= 1 && to <= order.length) {
            slideFrom = to > position ? 'next' : 'previous';
            navigate(paths.perform(setlist.id, to), { replace: true });
        }
    };
    const previous = h('button', { type: 'button', class: 'button', 'aria-label': 'Canto anterior', 'data-previous': true }, '‹');
    const next = h('button', { type: 'button', class: 'button', 'aria-label': 'Canto siguiente', 'data-next': true }, '›');
    previous.disabled = position === 1;
    next.disabled = position === order.length;
    previous.addEventListener('click', () => go(position - 1));
    next.addEventListener('click', () => go(position + 1));
    const counter = h('span', { class: 'perform__count', 'aria-live': 'polite' }, `${position}/${order.length}`);
    const nav = h('div', { class: 'perform__nav' }, previous, counter, next);

    const error = h('p', { class: 'error', role: 'alert' });
    const mode: Mode = readMode();
    const event = mode === 'event';
    const info = h('div', { class: 'perform__info' }, h('strong', {}, partName(item)));
    const switchMode = h('button', {
        type: 'button', class: 'perform__mode',
        'aria-label': event ? 'Modo evento. Cambiar a modo ensayo' : 'Modo ensayo. Cambiar a modo evento',
    }, event ? 'Modo evento' : 'Modo ensayo');
    switchMode.addEventListener('click', () => {
        saveMode(event ? 'rehearsal' : 'event');
        navigate(paths.perform(setlist.id, position), { replace: true });
    });
    info.append(' ', switchMode);
    if (!event) {
        // Rehearsal: the note can be written here, where the song is being tried
        const field = h('input', {
            type: 'text', class: 'perform__notefield', hidden: true, value: item.note, placeholder: 'Nota (opcional)',
            'aria-label': 'Nota de este canto', maxlength: String(LIMITS.itemNote), autocomplete: 'off',
        });
        const toggle = h('button', { type: 'button', class: 'perform__notebutton', 'aria-expanded': 'false' }, item.note === '' ? '📝 Agregar nota' : '📝 Nota');
        toggle.addEventListener('click', () => {
            field.hidden = !field.hidden;
            toggle.setAttribute('aria-expanded', String(!field.hidden));
            if (!field.hidden) {
                field.focus();
            }
        });
        field.addEventListener('change', () => {
            error.textContent = '';
            app.setlists.setNote(setlist.id, item.id, field.value).catch((failure: unknown) => {
                error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar la nota.';
            });
        });
        info.append(' ', toggle, field);
    } else if (item.note !== '') {
        // Event: the note is there when wanted and out of the way otherwise
        const text = h('p', { class: 'perform__note', hidden: true }, item.note);
        const toggle = h('button', { type: 'button', class: 'perform__notebutton', 'aria-expanded': 'false' }, '📝 Nota');
        toggle.addEventListener('click', () => {
            text.hidden = !text.hidden;
            toggle.setAttribute('aria-expanded', String(!text.hidden));
        });
        info.append(' ', toggle, text);
    }

    const bar = h('div', { class: 'viewer__bar' }, back, nav);
    let stage: HTMLElement;
    let dispose: () => void = () => undefined;
    if (song === undefined) {
        stage = h(
            'div',
            { class: 'stage is-scroll-stage' },
            h('div', { class: 'viewer-content' }, h('h2', {}, 'Canto eliminado'), h('p', {}, 'Este canto ya no está en la biblioteca. Quítalo del listado o sigue con el siguiente.')),
        );
    } else {
        const reader = createReader(song, {
            compact: event,
            shift: item.transpose,
            onShift: (shift) => {
                error.textContent = '';
                app.setlists.setTranspose(setlist.id, item.id, shift).catch((failure: unknown) => {
                    error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar el tono.';
                });
            },
        });
        bar.append(reader.toolbar);
        stage = reader.stage;
        dispose = reader.dispose;
    }

    // --- moving between songs without leaving the page ---
    const onKey = (event: KeyboardEvent): void => {
        const target = event.target as HTMLElement;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /^(input|textarea|select)$/i.test(target.tagName)) {
            return;
        }
        if (event.key === 'ArrowLeft') {
            go(position - 1);
        } else if (event.key === 'ArrowRight') {
            go(position + 1);
        }
    };
    document.addEventListener('keydown', onKey);

    let start: { x: number; y: number } | null = null;
    stage.addEventListener('touchstart', (event) => {
        const touch = event.touches[0];
        start = event.touches.length === 1 && touch !== undefined ? { x: touch.clientX, y: touch.clientY } : null;
    }, { passive: true });
    stage.addEventListener('touchend', (event) => {
        const touch = event.changedTouches[0];
        if (start === null || touch === undefined) {
            return;
        }
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        start = null;
        if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
            go(dx < 0 ? position + 1 : position - 1);
        }
    }, { passive: true });

    if (slideFrom !== null) {
        stage.classList.add(`slide-in-${slideFrom}`);
        slideFrom = null;
    }
    // Event mode: the tools give way when the lyrics are scrolled, and come back on scrolling up
    const chrome = h('div', { class: 'perform__chrome' }, h('div', { class: 'perform__chrome-inner' }, bar, info, error));
    const reveal = h('button', { type: 'button', class: 'perform__reveal', hidden: true, 'aria-label': 'Mostrar las herramientas' }, '☰');
    const collapse = (hide: boolean): void => {
        chrome.classList.toggle('is-collapsed', hide);
        chrome.inert = hide;
        reveal.hidden = !hide;
    };
    if (event) {
        let last = 0;
        stage.addEventListener('scroll', () => {
            const top = stage.scrollTop;
            const moved = top - last;
            if (moved > HIDE_AFTER && top > 80) {
                collapse(true);
            } else if (moved < -HIDE_AFTER || top <= 0) {
                collapse(false);
            }
            if (Math.abs(moved) > HIDE_AFTER) {
                last = top;
            }
        }, { passive: true });
        reveal.addEventListener('click', () => collapse(false));
    }
    const element = h('div', { class: 'viewer perform' }, chrome, reveal, stage);

    return {
        element,
        dispose: () => {
            document.removeEventListener('keydown', onKey);
            dispose();
        },
    };
}
