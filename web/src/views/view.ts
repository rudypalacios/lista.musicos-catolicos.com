import type { App } from '../app.ts';
import type { Song } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { readKeepAwake, readNotation } from '../prefs.ts';
import { paths } from '../router.ts';
import { screenKeeper } from '../wakelock.ts';
import { planSheet } from '../print/plan.ts';
import type { PrintVersion } from '../print/layout.ts';
import { printPlans } from '../print/print.ts';
import { deleteSongAfterAsking } from './delete-song.ts';
import { createReader } from './reader.ts';
import { showToast } from '../toast.ts';
import { createToneControl, type ToneControl } from './tone-control.ts';
import { createSheet, sheetAction } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/** ?t=2 → 2; no `t` (or anything else) → null. Kept within an octave (−11…11), as on the public site. */
function readTransposition(): number | null {
    const t = parseInt(new URLSearchParams(location.search).get('t') ?? '', 10);

    return Number.isFinite(t) ? t % 12 : null;
}

/** The key goes in the URL when it is not the person's own, so a transposed song can be shared and survives a reload */
function writeTransposition(t: number, mine: number): void {
    const url = new URL(location.href);
    if (t !== mine) {
        url.searchParams.set('t', String(t));
    } else {
        url.searchParams.delete('t');
    }
    history.replaceState(history.state, '', url);
}

/**
 * Reading one song of the library, in the key asked for in the address or, if none, the person's own
 * ("mi tono"). − and + move the key for now only; "Guardar como mi tono" makes it the person's own.
 *
 * One row of tools above the lyrics (the key, the lyrics size, "⋯"), so the song gets the screen. What is
 * used less goes behind the "⋯", in the same kind of sheet as the other screens: how the lyrics are drawn
 * (notation, fit, columns), printing, editing and deleting the song.
 */
export function viewView(app: App, navigate: Navigate, song: Song): View {
    /** "Mi tono": where the song opens, and what Guardar changes */
    let mine = song.myShift;
    const shift = readTransposition() ?? mine;
    /** The key on screen, which is the one that prints */
    let shown = shift;
    let tone: ToneControl | undefined;
    const reader = createReader(song, {
        sizeScope: 'songs',
        shift,
        // The key is in the key control: a pill with the same words in the head of the song would say it twice
        keyPill: false,
        onShift: (t) => {
            shown = t;
            writeTransposition(t, mine);
        },
        onKey: () => tone?.refresh(),
    });
    writeTransposition(shift, mine);
    const error = h('p', { class: 'error', role: 'alert', hidden: true });
    tone = createToneControl({
        compact: true,
        separateStep: true,
        reader,
        saved: () => mine,
        savedName: 'Mío',
        hint: 'Solo por ahora',
        primaryLabel: 'Guardar como mi tono',
        destinations: [{
            label: 'Como mi tono',
            save: async (t) => {
                error.hidden = true;
                try {
                    await app.setMyShift(song.id, t);
                } catch (failure) {
                    error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar tu tono.';
                    error.hidden = false;

                    return;
                }
                mine = t;
                writeTransposition(shown, mine);
                showToast('Tono guardado como tu tono', 3500, true);
            },
        }],
    });

    // --- "⋯": what is done less often ---
    const sheet = createSheet('Opciones del canto');
    sheet.element.classList.add('sheet-layer--window');
    const fail = (message: string): void => {
        error.textContent = message;
        error.hidden = false;
    };
    const print = (version: PrintVersion): void => {
        error.hidden = true;
        // Straight from the tap (a browser may refuse to print from anything later), then the sheet goes
        printPlans([planSheet(song, { version, shift: shown, notation: readNotation() })])
            .catch(() => fail('No se pudo preparar la impresión.'));
        sheet.close();
    };
    sheet.body.replaceChildren(
        h('h4', { class: 'sheet__title' }, song.title),
        ...(song.author === '' ? [] : [h('p', { class: 'sheet__sub' }, song.author)]),
        h('h3', {}, 'Letra'),
        h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Herramientas de la letra' }, reader.display),
        h('h3', {}, 'Este canto'),
        sheetAction('printer', 'Imprimir con acordes', () => print('chords')),
        sheetAction('printer', 'Imprimir solo la letra', () => print('lyrics')),
        sheetAction('pencil', 'Editar letra y acordes', () => {
            sheet.close(() => navigate(paths.edit(song.id)));
        }),
        // Last and set apart, so it is not touched by mistake next to printing
        sheetAction('trash', 'Eliminar canto', () => {
            error.hidden = true;
            sheet.close(() => {
                deleteSongAfterAsking(app, song)
                    .then((deleted) => (deleted ? navigate(paths.list()) : undefined))
                    .catch((failure: unknown) => fail(failure instanceof Error ? failure.message : 'No se pudo eliminar el canto.'));
            });
        }, { danger: true, apart: true }),
    );
    const more = h('button', { type: 'button', class: 'lrow__more song-tools__more', 'aria-label': 'Más opciones' }, icon('more', 22));
    more.addEventListener('click', () => sheet.open());

    const tools = h(
        'div',
        { class: 'song-tools' },
        h('div', { class: 'song-tools__row' }, tone.step, h('div', { class: 'toolbar' }, reader.size), more),
        tone.element,
    );

    // A song on a stand must not go dark while it is being read (unless turned off in Ajustes)
    const releaseScreen = readKeepAwake() ? screenKeeper.hold() : (): void => undefined;

    return {
        element: h('div', { class: 'viewer' }, tools, error, reader.stage, sheet.element),
        dispose: () => {
            releaseScreen();
            sheet.release();
            reader.dispose();
        },
    };
}
