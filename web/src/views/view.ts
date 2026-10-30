import type { App } from '../app.ts';
import type { Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { readKeepAwake } from '../prefs.ts';
import { paths } from '../router.ts';
import { screenKeeper } from '../wakelock.ts';
import { planSheet } from '../print/plan.ts';
import { printMenu } from './print-menu.ts';
import { createReader } from './reader.ts';
import { showToast } from '../toast.ts';
import { createToneControl, type ToneControl } from './tone-control.ts';
import type { View } from './types.ts';

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
 */
export function viewView(app: App, song: Song): View {
    /** "Mi tono": where the song opens, and what Guardar changes */
    let mine = song.myShift;
    const shift = readTransposition() ?? mine;
    /** The key on screen, which is the one that prints */
    let shown = shift;
    let tone: ToneControl | undefined;
    const reader = createReader(song, {
        sizeScope: 'songs',
        shift,
        externalTone: true,
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

    // In the same row as the other tools, where − / + used to be
    reader.toolbar.prepend(tone.element);
    const bar = h(
        'div',
        { class: 'viewer__bar' },
        reader.toolbar,
        printMenu((version, notation) => [planSheet(song, { version, shift: shown, notation })]),
        link(paths.edit(song.id), 'Editar', 'button edit'),
    );

    // A song on a stand must not go dark while it is being read (unless turned off in Ajustes)
    const releaseScreen = readKeepAwake() ? screenKeeper.hold() : (): void => undefined;

    return {
        element: h('div', { class: 'viewer' }, bar, error, reader.stage),
        dispose: () => {
            releaseScreen();
            reader.dispose();
        },
    };
}
