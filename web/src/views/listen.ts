/**
 * "Escuchar": the row a song with a link to hear the original carries between its tools and its lyrics, and the player it opens.
 *
 * - A YouTube or YouTube Music link: "▶ Escuchar aquí" opens YouTube's own player, fixed above the lyrics (a column beside them on a
 *   wide screen), so the words and the chords stay in sight while the original plays. The frame does not exist until that touch:
 *   nothing of YouTube is loaded before it, and closing the player (✕) removes the frame, which ends the sound. The controls are
 *   YouTube's (play, pause, the bar). "Abrir" goes to the link itself, in another tab or the app that handles it.
 * - Any other link: one button that opens it apart.
 * - Offline: the player says so, and the lyrics stay.
 *
 * The player is 16:9 across the width of the screen, never under the 200 px YouTube asks of an embedded player, and is not hidden
 * to leave only the sound (its terms do not allow that).
 */
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { clock, readListenUrl, youtubeEmbed } from '../listen-url.ts';

export interface Listen {
    /** Goes between the tools and the lyrics; empty when the song has no usable link */
    element: HTMLElement;
    /** Closes the player (ends the sound) */
    close: () => void;
    isOpen: () => boolean;
}

export interface ListenOptions {
    /** The player opened or closed: the page makes room for it */
    onToggle?: (open: boolean) => void;
}

const FRAME_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
/** What the frame may do: run YouTube's player, and open its own links; nothing of this page */
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';

export function createListen(listenUrl: string, options: ListenOptions = {}): Listen {
    const element = h('div', { class: 'song-listen-slot' });
    const read = readListenUrl(listenUrl);
    if (read.kind === 'none' || read.kind === 'bad') {
        return { element, close: () => undefined, isOpen: () => false };
    }
    const open = (href: string, label: Array<Node | string>, primary: boolean): HTMLAnchorElement =>
        h('a', { class: primary ? 'button button--primary' : 'button', href, target: '_blank', rel: 'noopener noreferrer' }, ...label);

    if (read.kind === 'link') {
        element.append(h('div', { class: 'song-listen' },
            open(read.href, [icon('external', 20), `Escuchar en ${read.site}`], true),
            h('span', { class: 'song-listen__hint' }, 'Se abre aparte')));

        return { element, close: () => undefined, isOpen: () => false };
    }

    let player: HTMLElement | null = null;
    const play = h('button', { type: 'button', class: 'button button--primary', 'aria-pressed': 'false' }, icon('play', 20), 'Escuchar aquí');
    const row = h('div', { class: 'song-listen' }, play, open(read.href, ['Abrir', icon('external', 20)], false));
    element.append(row);

    const close = (): void => {
        if (player === null) {
            return;
        }
        // Taking the frame out of the page is what ends the sound
        player.remove();
        player = null;
        play.setAttribute('aria-pressed', 'false');
        options.onToggle?.(false);
    };
    const show = (): void => {
        const screen = h('div', { class: 'song-player__screen' });
        if (navigator.onLine) {
            screen.append(h('iframe', {
                src: youtubeEmbed(read.id, read.start),
                title: `Reproductor de ${read.site}`,
                allow: FRAME_ALLOW,
                sandbox: FRAME_SANDBOX,
                referrerpolicy: 'strict-origin-when-cross-origin',
                allowfullscreen: true,
            }));
        } else {
            screen.append(h('div', { class: 'song-player__msg' },
                h('p', {}, 'Sin conexión. El audio necesita internet; la letra y los acordes siguen aquí.')));
        }
        const closeButton = h('button', { type: 'button', class: 'song-player__close', 'aria-label': 'Cerrar el reproductor' }, icon('x', 20));
        closeButton.addEventListener('click', close);
        const what = `Referencia · ${read.site}${read.start > 0 ? ` · arranca en ${clock(read.start)}` : ''}`;
        player = h('div', { class: 'song-player', role: 'region', 'aria-label': 'Escuchar el canto original' },
            screen, h('div', { class: 'song-player__bar' }, h('span', { class: 'song-player__what' }, what), closeButton));
        element.append(player);
        play.setAttribute('aria-pressed', 'true');
        options.onToggle?.(true);
    };
    play.addEventListener('click', () => (player === null ? show() : close()));

    return { element, close, isOpen: () => player !== null };
}
