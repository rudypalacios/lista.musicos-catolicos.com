import type { App } from '../app.ts';
import type { Song } from '../data/types.ts';
import { h, link } from '../dom.ts';
import { readKeepAwake } from '../prefs.ts';
import { paths } from '../router.ts';
import { screenKeeper } from '../wakelock.ts';
import { planSheet } from '../print/plan.ts';
import { printMenu } from './print-menu.ts';
import { createReader } from './reader.ts';
import type { View } from './types.ts';

/** ?t=2 → 2; anything else → 0. Kept within an octave (−11…11), as on the public site. */
function readTransposition(): number {
    const t = parseInt(new URLSearchParams(location.search).get('t') ?? '', 10);

    return Number.isFinite(t) ? t % 12 : 0;
}

/** The key goes in the URL, so a transposed song can be shared and survives a reload */
function writeTransposition(t: number): void {
    const url = new URL(location.href);
    if (t !== 0) {
        url.searchParams.set('t', String(t));
    } else {
        url.searchParams.delete('t');
    }
    history.replaceState(history.state, '', url);
}

/** Reading one song of the library, in its own key or the one asked for in the address */
export function viewView(app: App, song: Song): View {
    void app;
    const shift = readTransposition();
    /** The key on screen, which is the one that prints */
    let shown = shift;
    const reader = createReader(song, {
        sizeScope: 'songs',
        shift,
        onShift: (t) => {
            shown = t;
            writeTransposition(t);
        },
    });
    writeTransposition(shift);

    const bar = h(
        'div',
        { class: 'viewer__bar' },
        link(paths.list(), '← Cantos', 'button back'),
        reader.toolbar,
        printMenu((version, notation) => [planSheet(song, { version, shift: shown, notation })]),
        link(paths.edit(song.id), 'Editar', 'button edit'),
    );

    // A song on a stand must not go dark while it is being read (unless turned off in Ajustes)
    const releaseScreen = readKeepAwake() ? screenKeeper.hold() : (): void => undefined;

    return {
        element: h('div', { class: 'viewer' }, bar, reader.stage),
        dispose: () => {
            releaseScreen();
            reader.dispose();
        },
    };
}
