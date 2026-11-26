/**
 * "Escuchar el original": how a song with a link to hear it is listened to, from the places where "how does it go?" comes up.
 *
 * - The way in is small and costs the lyrics nothing: an option in the "⋯" sheet of the song (its page, a row of a list, singing) and,
 *   in a list, a ♪ in the row of the songs that have a link (`listenButton`).
 * - A YouTube or YouTube Music link opens YouTube's own player. **Wherever it appears (the page of a song, a list, singing, a shared
 *   list) it is the same window that floats and is dragged by its bar** (the owner, 2026-11-26): it has nothing behind it, so the
 *   lyrics can be touched and scrolled while it plays, and on a phone it may be pushed past an edge, leaving only its bar in sight
 *   (`float.ts`). The frame does not exist until the touch: nothing of YouTube is loaded before it, and closing (✕) takes
 *   the frame away, which ends the sound. The controls are YouTube's.
 * - Any other link has no player: it opens apart.
 * - Offline: the player says so.
 *
 * The player is 16:9 across the width and never under the 200 px YouTube asks of an embedded player. Folding it away or pushing it
 * off the screen is the person's choice and the sound goes on; the owner knows YouTube's terms ask for the player to be in sight.
 */
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { clock, readListenUrl, youtubeEmbed, type ListenUrl } from '../listen-url.ts';
import { sheetAction } from './sheet.ts';
import { makeFloating, type Floating } from './float.ts';

/** What of a link can be listened to: a video of YouTube, or a link that opens apart */
export type Listenable = Extract<ListenUrl, { kind: 'youtube' | 'link' }>;

const FRAME_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
/** What the frame may do: run YouTube's player, and open its own links; nothing of this page */
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';

/** The link of a song, if it has one that can be listened to */
export function listenableOf(song: { readonly listenUrl: string }): Listenable | null {
    const read = readListenUrl(song.listenUrl);

    return read.kind === 'youtube' || read.kind === 'link' ? read : null;
}

/** What the sheet says under "Escuchar el original": the site, and the second it starts at */
export function listenHint(read: Listenable): string {
    return read.kind === 'youtube' ? `${read.site}${read.start > 0 ? ` · arranca en ${clock(read.start)}` : ''}` : `${read.site} · se abre aparte`;
}

/** Opens a link in another tab, from a touch (so a browser lets it) */
function openApart(href: string): void {
    window.open(href, '_blank', 'noopener,noreferrer');
}

/** YouTube's player: its frame, or the words that say there is no connection. 16:9, whatever the width */
function playerScreen(read: Extract<Listenable, { kind: 'youtube' }>): HTMLElement {
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
        screen.append(h('div', { class: 'song-player__msg' }, h('p', {}, 'Sin conexión. El audio necesita internet; la letra y los acordes siguen aquí.')));
    }

    return screen;
}

/**
 * Where there is room (`LISTEN_ROOM`: a tablet, a window) the ♪ is drawn in the bar or the row and the menu does not repeat it; on a
 * phone the ♪ is not drawn and the menu is the way in. The rule is in CSS (`.listen-in-menu`), so a turned tablet follows it by itself.
 */
function markInMenu(option: HTMLElement): HTMLElement {
    option.classList.add('listen-in-menu');

    return option;
}

/**
 * The option of a sheet. For YouTube it runs `play` (what opens the player: the caller closes its sheet first); for any other link it
 * opens it apart.
 */
export function listenAction(read: Listenable, play: () => void): HTMLElement {
    if (read.kind === 'link') {
        return markInMenu(sheetAction('external', `Escuchar en ${read.site}`, () => openApart(read.href), { hint: listenHint(read) }));
    }

    return markInMenu(sheetAction('music', 'Escuchar el original', play, { hint: listenHint(read) }));
}

/**
 * The ♪: a button that opens the player, or (another site) a link that opens apart. In the row of a song of a list (`title` says which
 * song it is for) and, with its own classes, in the row of tools of the song's page.
 */
export function listenButton(read: Listenable, title: string, play: () => void, className = 'item__more item__listen'): HTMLElement {
    const name = title === '' ? '' : `: ${title}`;
    if (read.kind === 'link') {
        return h('a', {
            class: className, href: read.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Escuchar en ${read.site}${name}`,
        }, icon('music', 20));
    }
    const button = h('button', { type: 'button', class: className, 'aria-label': `Escuchar el original${name}`, 'aria-pressed': 'false' }, icon('music', 20));
    button.addEventListener('click', play);

    return button;
}

// ---------- the player: a bar (its handle) over YouTube's frame ----------

interface PlayerOptions {
    /** What the bar says: the song and where it plays, or just where */
    what: string;
    close: () => void;
}

function buildPlayer(read: Extract<Listenable, { kind: 'youtube' }>, options: PlayerOptions): { element: HTMLElement; handle: HTMLElement } {
    const closeButton = h('button', { type: 'button', class: 'song-player__close', 'aria-label': 'Cerrar el reproductor' }, icon('x', 20));
    closeButton.addEventListener('click', options.close);
    // The same little bar every half sheet has on top: what people already know means "hold and move me"
    const handle = h('div', { class: 'song-player__head' },
        h('span', { class: 'sheet__grab song-player__grabber', 'aria-hidden': 'true' }),
        h('div', { class: 'song-player__bar' },
            h('span', { class: 'song-player__what' }, options.what),
            h('a', { class: 'button', href: read.href, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir', icon('external', 20)),
            closeButton));
    const element = h('div', { class: 'song-player', role: 'region', 'aria-label': 'Escuchar el canto original' }, handle, playerScreen(read));
    return { element, handle };
}

// ---------- in a list, or singing: a window that floats ----------

export interface ListenSheet {
    /** Goes anywhere in the screen: the player is `position: fixed` */
    element: HTMLElement;
    /** Opens the player for the song (another one that was open is replaced) */
    open: (song: { readonly title: string; readonly author: string; readonly listenUrl: string }) => void;
    release: () => void;
}

/** The player in a list or while singing. Named for the sheet it used to be; it has no backdrop any more, so the lyrics stay in reach */
export function createListenSheet(): ListenSheet {
    const element = h('div', { class: 'song-listen-slot' });
    let floating: Floating | null = null;
    const close = (): void => {
        // Taking the frame out of the page is what ends the sound
        floating?.dispose();
        floating = null;
        element.replaceChildren();
    };

    return {
        element,
        open: (song) => {
            const read = listenableOf(song);
            if (read === null) {
                return;
            }
            if (read.kind === 'link') {
                openApart(read.href);

                return;
            }
            close();
            const { element: player, handle } = buildPlayer(read, { what: `${song.title} · ${listenHint(read)}`, close });
            element.append(player);
            floating = makeFloating(player, handle);
            floating.place();
        },
        release: close,
    };
}

// ---------- on the page of a song: fixed above the lyrics ----------

export interface Listen {
    /** Goes between the tools and the lyrics: empty until the player is opened */
    element: HTMLElement;
    /** The link of the song, null when it has none that can be listened to */
    read: Listenable | null;
    /** Opens the player (a link of YouTube) or, for any other link, opens it apart */
    open: () => void;
    /** Closes the player (ends the sound) */
    close: () => void;
    isOpen: () => boolean;
}

export interface ListenOptions {
    /** The player opened or closed: the page makes room for it */
    onToggle?: (open: boolean) => void;
    /** The person moved the floating window (from 600px): the page no longer needs to keep a column free for it */
    onMoved?: () => void;
}

export function createListen(listenUrl: string, options: ListenOptions = {}): Listen {
    const element = h('div', { class: 'song-listen-slot' });
    const read = listenableOf({ listenUrl });
    let player: HTMLElement | null = null;
    let floating: Floating | null = null;
    const close = (): void => {
        if (player === null) {
            return;
        }
        // Taking the frame out of the page is what ends the sound
        floating?.dispose();
        floating = null;
        player.remove();
        player = null;
        options.onToggle?.(false);
    };
    const open = (): void => {
        if (read === null || player !== null) {
            return;
        }
        if (read.kind === 'link') {
            openApart(read.href);

            return;
        }
        const built = buildPlayer(read, { what: `Referencia · ${listenHint(read)}`, close });
        player = built.element;
        element.append(player);
        floating = makeFloating(player, built.handle, options.onMoved === undefined ? {} : { onMoved: options.onMoved });
        floating.place();
        options.onToggle?.(true);
    };

    return { element, read, open, close, isOpen: () => player !== null };
}
