/**
 * The sheet that opens when a syllable of the editor's preview is touched, to put a chord on it. The chord is put together from
 * its pieces (`chordpro/chord-builder.ts`: note, sharp or flat, number, terms, bass, "otro") and written into the text with every
 * touch, so there is nothing to confirm: a touch on a piece already marked takes it away, and no marked note means no chord.
 *
 * It sits in the editor's foot, just above Guardar and Cancelar. On a phone it has three levels (expanded, low, closed) and a
 * handle that follows the finger between them (`sheet-detents.ts`); on a wide screen there is room for all of it, so it is shown
 * whole, with no handle and no gesture. The sheet is laid out once at its full height and only moved with a transform (dragging,
 * opening, closing and growing never touch the layout of the lyrics while they move): the dock is as tall as what shows of it.
 *
 * Two marks that mean different things: "En este canto" marks the chord the syllable has; "Nota" is marked only while the chord is
 * being built. Opening a syllable that has a chord marks the first, so a note touched now starts a chord from zero; the handle
 * pulled up loads the chord into the builder instead, to change a piece of it and keep the rest.
 */
import { latin, type Notation } from '../chordpro/chord.ts';
import * as chordBuilder from '../chordpro/chord-builder.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { levelsOf, pickLevel, velocityOf, type Sample } from '../sheet-detents.ts';

export interface ChordSheetOptions {
    /** The chord written at a place now (English notation), null when it has none, undefined when the place is gone */
    chordAt: (id: string) => string | null | undefined;
    /** The syllable a place is on, for the screen reader */
    labelAt: (id: string) => string;
    /** The chords in the song, in the order they appear, each once: to put one again with a touch */
    used: () => readonly string[];
    /** Puts a chord at a place (English notation); null takes the one there out */
    write: (id: string, chord: string | null) => void;
    notation: () => Notation;
    /** From 900px: all of the sheet shown, no handle */
    wide: MediaQueryList;
    /** The place now being worked on, or null: the preview marks it */
    onPick: (id: string | null) => void;
    /** How tall what shows of the sheet is, in px (0 closed): the editor keeps the syllable clear of it */
    onHeight: (height: number) => void;
}

export interface ChordSheet {
    /** The dock to put in the editor's foot (hidden while no place is picked) */
    element: HTMLElement;
    /** Opens the sheet on a place, or moves it to another */
    pick: (id: string) => void;
    /** The text changed: draws again what the picked place has now, or closes if the place is gone */
    refresh: () => void;
    /** Closes it, with the way down on a phone */
    close: () => void;
    /** Closes it at once */
    dismiss: () => void;
    picked: () => string | null;
    dispose: () => void;
}

const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';
const EASE_IN = 'cubic-bezier(.4,0,1,1)';
/** How far (px) the finger must move for a touch on the handle to be a drag and not a tap */
const DRAG_FROM = 4;
/** How much of the row of chords a touch of its arrows moves */
const ROW_STEP = 0.75;

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Drag {
    startY: number;
    from: number;
    position: number;
    moved: boolean;
    sheet: HTMLElement;
    samples: Sample[];
}

export function createChordSheet(options: ChordSheetOptions): ChordSheet {
    const element = h('div', { class: 'chord-dock', hidden: true });
    let picked: string | null = null;
    let builder = chordBuilder.blank();
    /** The details in view (on a phone: pulled up or a note touched; wide: always) */
    let expanded = false;
    let sheet: HTMLElement | null = null;
    /** How far down the sheet sits when low, how tall it is, and where it sits now */
    let layout = { lowOffset: 0, full: 0, offset: 0 };
    let leaving = false;
    let centerUsed = true;
    let drag: Drag | null = null;
    /** While an action writes into the text, the editor draws again by itself: the sheet is drawn once, afterwards */
    let writing = false;

    const show = (chord: string): string => (options.notation() === 'latin' ? latin(chord) : chord);
    const noteLabel = (note: string): string => show(note);

    // ----- what is drawn -----
    const chip = (act: string, value: string, label: string, on: boolean): HTMLButtonElement =>
        h('button', { type: 'button', class: on ? 'chord-chip is-on' : 'chord-chip', 'data-act': act, 'data-v': value, 'aria-pressed': String(on) }, label);

    const row = (label: string, ...children: Array<Node | string>): HTMLElement =>
        h('div', { class: 'chord-sheet__row' }, h('span', { class: 'chord-sheet__label' }, label), ...children);

    const usedRow = (chord: string | null): HTMLElement | null => {
        const chords = options.used();
        if (chords.length === 0) {
            return null;
        }
        const list = h('div', { class: 'chord-used__list' }, ...chords.map((name) => chip('use', name, show(name), name === chord)));
        const arrow = (side: 'left' | 'right'): HTMLButtonElement => h('button', {
            type: 'button', class: `chord-used__arrow chord-used__arrow--${side}`, 'data-act': 'scroll', 'data-v': side === 'left' ? '-1' : '1', hidden: true,
            'aria-label': side === 'left' ? 'Ver los acordes anteriores' : 'Ver más acordes',
        }, icon(side === 'left' ? 'chevron-left' : 'chevron-right', 20));

        return row('En este canto', h('div', { class: 'chord-used' }, arrow('left'), list, arrow('right')));
    };

    const detailsOf = (chord: string | null): HTMLElement | null => {
        // What the details show: the builder, or (hidden until the handle is pulled) the chord itself
        const shown = builder.root !== null ? builder : chordBuilder.readChord(chord ?? '');
        if (shown.root === null) {
            return null;
        }
        const bass = shown.bass;

        return h('div', { class: 'chord-sheet__more' },
            row('Alteración y número',
                chip('acc', '1', '#', shown.accidental === 1), chip('acc', '-1', 'b', shown.accidental === -1),
                h('span', { class: 'chord-sheet__gap' }),
                ...chordBuilder.NUMBERS.map((number) => chip('num', number, number, shown.number === number))),
            row('Términos', ...chordBuilder.TERMS.map((term) => chip('term', term, term, shown.terms.includes(term)))),
            // The bass note, and "otro" for whatever the pieces above cannot say
            h('div', { class: 'chord-sheet__row' },
                chip('bassopen', '', '/ bajo', bass !== null),
                h('input', { class: 'chord-sheet__other', type: 'text', value: shown.extra, placeholder: 'Otro: 7b5, 6/9…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Otro término' })),
            ...(bass === null ? [] : [row('Nota del bajo',
                ...chordBuilder.NOTES.map((note) => chip('bass', note, noteLabel(note), bass.root === note)),
                chip('bassacc', '1', '#', bass.accidental === 1), chip('bassacc', '-1', 'b', bass.accidental === -1))]));
    };

    const build = (chord: string | null): HTMLElement => {
        const shown = chord === null ? '' : show(chord);
        const size = shown.length >= 15 ? ' chord-sheet__chord--l2' : shown.length >= 10 ? ' chord-sheet__chord--l1' : '';
        const wide = options.wide.matches;
        const grip = !wide;
        const close = h('button', { type: 'button', class: 'chord-sheet__close', 'data-act': 'close', 'aria-label': 'Cerrar' }, icon('x', 20));
        const head = h('div', {
            class: grip ? 'chord-sheet__head chord-sheet__head--grip' : 'chord-sheet__head',
            ...(grip ? { role: 'button', tabindex: '0', 'aria-expanded': String(expanded), 'aria-label': `${expanded ? 'Contraer' : 'Expandir'} el acorde: arrastra hacia arriba o abajo` } : {}),
        },
        h('div', { class: 'chord-sheet__main' },
            h('span', { class: `chord-sheet__chord${size}${chord === null ? ' is-none' : ''}`, 'aria-live': 'polite' }, chord === null ? '—' : shown),
            // The stored text is shown only in Latin: in English it would repeat the chord
            ...(chord !== null && options.notation() === 'latin' ? [h('span', { class: 'chord-sheet__code' }, `[${chord}]`)] : [])),
        close);
        const notes = row('Nota', ...chordBuilder.NOTES.map((note) => chip('root', note, noteLabel(note), builder.root === note)));
        notes.classList.add('chord-sheet__notes');
        const more = detailsOf(chord);
        const used = usedRow(chord);

        return h('div', {
            class: `chord-sheet${expanded || wide ? '' : ' chord-sheet--peek'}`, role: 'dialog',
            'aria-label': `Acorde de la sílaba «${picked === null ? '' : options.labelAt(picked)}»`,
        }, head, h('div', { class: 'chord-sheet__body' }, ...(used === null ? [] : [used]), notes, ...(more === null ? [] : [more])));
    };

    // ----- movement: only transforms -----
    const translateOf = (target: HTMLElement): number => new DOMMatrix(getComputedStyle(target).transform).m42;
    const travel = (target: HTMLElement, from: number, to: number, ms: number, easing: string): Animation => {
        target.classList.add('is-moving');
        const animation = target.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration: ms, easing });
        const done = (): void => target.classList.remove('is-moving');
        animation.finished.then(done, done);

        return animation;
    };

    const render = (): void => {
        if (picked === null) {
            sheet = null;
            element.replaceChildren();
            element.style.height = '';
            element.hidden = true;
            options.onHeight(0);

            return;
        }
        const chord = options.chordAt(picked);
        if (chord === undefined) {
            // The place is gone (its chord was taken out and nothing is sung from it)
            dismiss();

            return;
        }
        // Where the sheet is on screen now (a dragged place included): it travels from there to where it is about to be
        const before = sheet?.getBoundingClientRect().top ?? null;
        const oldRow = element.querySelector<HTMLElement>('.chord-used__list');
        const oldScroll = oldRow?.scrollLeft ?? 0;
        const next = build(chord);
        element.hidden = false;
        element.replaceChildren(next);
        sheet = next;

        const wide = options.wide.matches;
        if (wide) {
            element.style.height = '';
            element.style.marginTop = '';
            layout = { lowOffset: 0, full: next.offsetHeight, offset: 0 };
            options.onHeight(next.offsetHeight);
        } else {
            const more = next.querySelector<HTMLElement>('.chord-sheet__more');
            const notes = next.querySelector<HTMLElement>('.chord-sheet__notes');
            const full = next.offsetHeight;
            // What shows when low: down to the row of notes, and the room under it that the sheet has at its foot
            const low = (notes?.offsetTop ?? 0) + (notes?.offsetHeight ?? 0) + parseFloat(getComputedStyle(next).paddingBottom);
            const lowOffset = more === null ? 0 : Math.max(0, full - low);
            const offset = expanded && more !== null ? 0 : lowOffset;
            layout = { lowOffset, full, offset };
            // The dock clips what hangs below it (so it adds nothing to the scroll of the page) and reaches up by the room the sheet
            // has to rise in, an empty strip that the negative margin gives back: in the layout it is as tall as what shows of the sheet
            element.style.height = `${full - offset + lowOffset}px`;
            element.style.marginTop = `calc(0.5rem - ${lowOffset}px)`;
            next.style.transform = `translateY(${offset}px)`;
            options.onHeight(full - offset);
            if (!reduced()) {
                const delta = (before ?? window.innerHeight) - next.getBoundingClientRect().top;
                if (Math.abs(delta) > 1) {
                    travel(next, offset + delta, offset, before === null ? 280 : 240, EASE_OUT);
                }
            }
        }
        placeUsedRow(oldScroll);
    };

    /** The row of chords of the song: where it was, or the marked one in the middle (a new sheet, another syllable) */
    const placeUsedRow = (oldScroll: number): void => {
        const list = element.querySelector<HTMLElement>('.chord-used__list');
        if (list === null) {
            return;
        }
        const marked = list.querySelector<HTMLElement>('.is-on');
        list.scrollLeft = centerUsed && marked !== null ? marked.offsetLeft - (list.clientWidth - marked.offsetWidth) / 2 : oldScroll;
        centerUsed = false;
        const left = element.querySelector<HTMLElement>('.chord-used__arrow--left');
        const right = element.querySelector<HTMLElement>('.chord-used__arrow--right');
        const edges = (): void => {
            if (left !== null) {
                left.hidden = list.scrollLeft <= 2;
            }
            if (right !== null) {
                right.hidden = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
            }
        };
        edges();
        list.addEventListener('scroll', edges, { passive: true });
        // A mouse wheel only turns vertically: over this row it moves the row (a trackpad's own sideways gesture is left alone)
        list.addEventListener('wheel', (event) => {
            if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
                return;
            }
            const to = Math.min(list.scrollWidth - list.clientWidth, Math.max(0, list.scrollLeft + event.deltaY));
            if (to !== list.scrollLeft) {
                event.preventDefault();
                list.scrollLeft = to;
            }
        }, { passive: false });
    };

    // ----- what the person does -----
    const currentChord = (): string | null => (picked === null ? null : options.chordAt(picked) ?? null);
    const write = (chord: string | null): void => {
        if (picked !== null) {
            options.write(picked, chord);
        }
    };
    const writeBuilder = (): void => {
        const name = chordBuilder.nameOf(builder);
        if (name !== '') {
            write(name);
        }
    };
    /** Takes the chord out and starts again with nothing marked */
    const remove = (): void => {
        write(null);
        builder = chordBuilder.blank();
        expanded = false;
    };
    const expand = (): void => {
        if (builder.root === null) {
            builder = chordBuilder.readChord(currentChord() ?? '');
        }
        expanded = true;
    };
    const collapse = (): void => {
        expanded = false;
        builder = chordBuilder.blank();
    };
    const canExpand = (): boolean => builder.root !== null || chordBuilder.readChord(currentChord() ?? '').root !== null;

    function dismiss(): void {
        leaving = false;
        picked = null;
        builder = chordBuilder.blank();
        expanded = false;
        options.onPick(null);
        render();
    }

    const closeAnimated = (): void => {
        if (sheet === null || options.wide.matches || reduced()) {
            dismiss();

            return;
        }
        const target = sheet;
        leaving = true;
        const from = translateOf(target);
        const to = from + (window.innerHeight - target.getBoundingClientRect().top);
        target.getAnimations().forEach((animation) => animation.cancel());
        target.style.transform = `translateY(${to}px)`;
        const done = (): void => {
            if (leaving) {
                dismiss();
            }
        };
        travel(target, from, to, 200, EASE_IN).finished.then(done, done);
    };

    const toggleExpanded = (): void => {
        if (!canExpand()) {
            return;
        }
        if (expanded) {
            collapse();
        } else {
            expand();
        }
        render();
    };

    element.addEventListener('click', (event) => {
        const target = (event.target as Element).closest<HTMLElement>('[data-act]');
        if (target === null || leaving) {
            return;
        }
        const act = target.dataset['act'];
        const value = target.dataset['v'] ?? '';
        if (act === 'close') {
            closeAnimated();

            return;
        }
        if (act === 'scroll') {
            const list = element.querySelector<HTMLElement>('.chord-used__list');
            list?.scrollBy({ left: Number(value) * list.clientWidth * ROW_STEP, behavior: reduced() ? 'auto' : 'smooth' });

            return;
        }
        writing = true;
        switch (act) {
            case 'use':
                if (currentChord() === value) {
                    remove();
                } else {
                    write(value);
                    builder = chordBuilder.blank();
                    expanded = options.wide.matches;
                }
                break;
            case 'root':
                if (builder.root === value) {
                    remove();
                } else {
                    builder = chordBuilder.setRoot(builder, value as chordBuilder.Note);
                    expanded = true;
                    writeBuilder();
                }
                break;
            case 'acc':
                builder = chordBuilder.toggleAccidental(builder, value === '1' ? 1 : -1);
                writeBuilder();
                break;
            case 'num':
                builder = chordBuilder.toggleNumber(builder, value);
                writeBuilder();
                break;
            case 'term':
                builder = chordBuilder.toggleTerm(builder, value as chordBuilder.Term);
                writeBuilder();
                break;
            case 'bassopen':
                builder = chordBuilder.toggleBass(builder);
                writeBuilder();
                break;
            case 'bass':
                builder = chordBuilder.setBassRoot(builder, value as chordBuilder.Note);
                writeBuilder();
                break;
            case 'bassacc':
                builder = chordBuilder.toggleBassAccidental(builder, value === '1' ? 1 : -1);
                writeBuilder();
                break;
            default:
                break;
        }
        writing = false;
        // On a wide screen the details of the chord are shown whole, so what is marked there is the builder
        if (options.wide.matches && builder.root === null) {
            builder = chordBuilder.readChord(currentChord() ?? '');
        }
        render();
    });
    // "Otro": written when the field is left or Enter is pressed, not at every letter (the sheet is drawn again with each write)
    element.addEventListener('change', (event) => {
        const field = event.target as HTMLInputElement;
        if (!field.classList.contains('chord-sheet__other') || leaving) {
            return;
        }
        if (builder.root === null) {
            builder = chordBuilder.readChord(currentChord() ?? '');
        }
        builder = chordBuilder.setExtra(builder, field.value);
        writing = true;
        writeBuilder();
        writing = false;
        render();
    });
    element.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && (event.target as Element).classList.contains('chord-sheet__head--grip')) {
            event.preventDefault();
            toggleExpanded();
        }
    });

    // ----- the handle follows the finger and rests at the nearest level -----
    const onMove = (event: PointerEvent): void => {
        if (drag === null) {
            return;
        }
        const dy = event.clientY - drag.startY;
        if (Math.abs(dy) > DRAG_FROM) {
            drag.moved = true;
        }
        // It cannot rise above its expanded place
        drag.position = Math.max(0, drag.from + dy);
        drag.sheet.style.transform = `translateY(${drag.position}px)`;
        const now = performance.now();
        drag.samples.push({ time: now, y: event.clientY });
        while (drag.samples.length > 2 && now - (drag.samples[0]?.time ?? now) > 100) {
            drag.samples.shift();
        }
    };
    const onRelease = (): void => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onRelease);
        document.removeEventListener('pointercancel', onRelease);
        if (drag === null) {
            return;
        }
        const ended = drag;
        drag = null;
        ended.sheet.classList.remove('is-held');
        if (!ended.moved) {
            ended.sheet.style.transform = `translateY(${ended.from}px)`;
            toggleExpanded();

            return;
        }
        const level = pickLevel(ended.position, velocityOf(ended.samples), levelsOf(layout.lowOffset, layout.full));
        if (level === 'closed') {
            closeAnimated();

            return;
        }
        if (level === 'expanded' && !expanded) {
            expand();
        } else if (level === 'low' && expanded) {
            collapse();
        }
        // The same drawing travels from where the finger left the sheet to the level it goes to
        render();
    };
    element.addEventListener('pointerdown', (event) => {
        const head = (event.target as Element).closest<HTMLElement>('.chord-sheet__head--grip');
        if (head === null || sheet === null || leaving || (event.target as Element).closest('button') !== null) {
            return;
        }
        const from = translateOf(sheet);
        sheet.getAnimations().forEach((animation) => animation.cancel());
        sheet.style.transform = `translateY(${from}px)`;
        sheet.classList.add('is-moving', 'is-held');
        drag = { startY: event.clientY, from, position: from, moved: false, sheet, samples: [{ time: performance.now(), y: event.clientY }] };
        head.setPointerCapture?.(event.pointerId);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onRelease);
        document.addEventListener('pointercancel', onRelease);
    });

    // A change of screen width while the sheet is open: wide shows it whole, narrow starts low
    const onWideChange = (): void => {
        if (picked === null) {
            return;
        }
        if (options.wide.matches) {
            builder = chordBuilder.readChord(currentChord() ?? '');
            expanded = true;
        } else {
            collapse();
        }
        render();
    };
    options.wide.addEventListener('change', onWideChange);

    return {
        element,
        pick: (id) => {
            if (picked === id) {
                return;
            }
            leaving = false;
            picked = id;
            centerUsed = true;
            if (options.wide.matches) {
                builder = chordBuilder.readChord(options.chordAt(id) ?? '');
                expanded = true;
            } else {
                builder = chordBuilder.blank();
                expanded = false;
            }
            options.onPick(id);
            render();
        },
        refresh: () => {
            if (picked !== null && !writing) {
                render();
            }
        },
        close: closeAnimated,
        dismiss,
        picked: () => picked,
        dispose: () => {
            options.wide.removeEventListener('change', onWideChange);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onRelease);
            document.removeEventListener('pointercancel', onRelease);
            leaving = false;
        },
    };
}
