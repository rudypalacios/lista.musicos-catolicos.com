/**
 * "Escuchar el original": how a song with a link to hear it is listened to, from the places where "how does it go?" comes up.
 *
 * - The way in is small and costs the lyrics nothing: an option in the "⋯" sheet of the song (its page, a row of a list, singing) and,
 *   in a list, a ♪ in the row of the songs that have a link (`listenButton`).
 * - A YouTube or YouTube Music link opens YouTube's own player: **fixed above the lyrics on the page of a song** (`createListen`; a
 *   column beside them from 900px), where the lyrics are in sight while it plays, and **in a sheet from the bottom** in a list and
 *   while singing (`createListenSheet`), where it is a thing to look at for a moment and then close. The frame does not exist
 *   until that touch: nothing of YouTube is loaded before it, and closing takes the frame away, which ends the sound. The controls
 *   are YouTube's.
 * - Any other link has no player: it opens apart.
 * - Offline: the player says so.
 *
 * The player is 16:9 across the width (never under the 200 px YouTube asks of an embedded player) and is not hidden to leave only the
 * sound (its terms do not allow that).
 */
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { clock, readListenUrl, youtubeEmbed, type ListenUrl } from '../listen-url.ts';
import { createSheet, sheetAction, sheetHead, sheetList } from './sheet.ts';

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
 * The option of a sheet. For YouTube it runs `play` (what opens the player: the caller closes its sheet first); for any other link it
 * opens it apart.
 */
export function listenAction(read: Listenable, play: () => void): HTMLElement {
    if (read.kind === 'link') {
        return sheetAction('external', `Escuchar en ${read.site}`, () => openApart(read.href), { hint: listenHint(read) });
    }

    return sheetAction('music', 'Escuchar el original', play, { hint: listenHint(read) });
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

// ---------- in a sheet: a list, or singing ----------

export interface ListenSheet {
    /** Goes inside the screen it covers */
    element: HTMLElement;
    /** Opens the player of a song (a link of YouTube); any other link opens apart */
    open: (song: { readonly title: string; readonly author: string; readonly listenUrl: string }) => void;
    release: () => void;
}

export function createListenSheet(): ListenSheet {
    const sheet = createSheet('Escuchar el original');
    sheet.element.classList.add('sheet-layer--window');
    // Closing takes the frame out of the page, which ends the sound; the sheet itself stays for the next time
    const clear = new MutationObserver(() => {
        if (!sheet.isOpen()) {
            sheet.body.replaceChildren();
        }
    });
    clear.observe(sheet.element, { attributes: true, attributeFilter: ['class'] });

    return {
        element: sheet.element,
        open: (song) => {
            const read = listenableOf(song);
            if (read === null) {
                return;
            }
            if (read.kind === 'link') {
                openApart(read.href);

                return;
            }
            const close = h('button', { type: 'button', class: 'sheet-head__tool', 'aria-label': 'Cerrar' }, icon('x', 22));
            close.addEventListener('click', () => sheet.close());
            sheet.body.replaceChildren(
                sheetList(sheetHead(song.title, [...(song.author === '' ? [] : [song.author, ' · ']), listenHint(read)], close)),
                playerScreen(read),
                h('div', { class: 'song-player__bar' },
                    h('span', { class: 'song-player__what' }, 'Se cierra con ✕ o tocando fuera'),
                    h('a', { class: 'button', href: read.href, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir', icon('external', 20))),
            );
            sheet.open();
        },
        release: () => {
            sheet.release();
            clear.disconnect();
            sheet.body.replaceChildren();
        },
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
}

export function createListen(listenUrl: string, options: ListenOptions = {}): Listen {
    const element = h('div', { class: 'song-listen-slot' });
    const read = listenableOf({ listenUrl });
    let player: HTMLElement | null = null;
    const close = (): void => {
        if (player === null) {
            return;
        }
        // Taking the frame out of the page is what ends the sound
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
        const closeButton = h('button', { type: 'button', class: 'song-player__close', 'aria-label': 'Cerrar el reproductor' }, icon('x', 20));
        closeButton.addEventListener('click', close);
        player = h('div', { class: 'song-player', role: 'region', 'aria-label': 'Escuchar el canto original' },
            playerScreen(read),
            h('div', { class: 'song-player__bar' },
                h('span', { class: 'song-player__what' }, `Referencia · ${listenHint(read)}`),
                h('a', { class: 'button', href: read.href, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir', icon('external', 20)),
                closeButton));
        element.append(player);
        options.onToggle?.(true);
    };

    return { element, read, open, close, isOpen: () => player !== null };
}
