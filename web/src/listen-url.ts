/**
 * The link a song carries to hear the original ("Enlace para escuchar"): what a pasted text is, and what the app does with it.
 * Pure. Three kinds of answer:
 *
 * - a YouTube or YouTube Music video: the app can play it in the page (`youtubeEmbed`), from its id and, if the link says so, the
 *   second it starts at;
 * - any other `https` link (Spotify, Apple Music, the choir's own site…): it only opens apart;
 * - nothing usable: the reason, in words the person can act on.
 *
 * The address of the player is always built from the video id, **never** from the text that was pasted, so nothing a person
 * pastes can become what a frame loads.
 */

/** The same as the server's (`SongChange::MAX_LISTEN_URL`) */
export const MAX_LISTEN_URL = 500;

export type ListenUrl =
    | { kind: 'none' }
    | { kind: 'bad'; why: string }
    | { kind: 'link'; site: string; href: string }
    | { kind: 'youtube'; site: 'YouTube' | 'YouTube Music'; id: string; start: number; href: string };

const SITES: Readonly<Record<string, string>> = {
    'open.spotify.com': 'Spotify',
    'music.apple.com': 'Apple Music',
    'soundcloud.com': 'SoundCloud',
    'deezer.com': 'Deezer',
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

/** A YouTube video id: 11 letters, digits, "-" and "_" */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Where the text is read: what is pasted, trimmed */
export function readListenUrl(text: string): ListenUrl {
    const raw = text.trim();
    if (raw === '') {
        return { kind: 'none' };
    }
    if (Array.from(raw).length > MAX_LISTEN_URL) {
        return { kind: 'bad', why: `El enlace es demasiado largo (máximo ${MAX_LISTEN_URL} caracteres).` };
    }
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { kind: 'bad', why: 'Pon un enlace completo, que empiece con https://' };
    }
    if (url.protocol !== 'https:' || /[\s<>"'\\]/.test(raw)) {
        return { kind: 'bad', why: 'Pon un enlace que empiece con https://' };
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (YOUTUBE_HOSTS.has(host)) {
        const id = videoIdOf(host, url);
        if (id !== null) {
            return {
                kind: 'youtube',
                site: host === 'music.youtube.com' ? 'YouTube Music' : 'YouTube',
                id,
                start: startOf(url.searchParams.get('t') ?? url.searchParams.get('start') ?? ''),
                href: raw,
            };
        }
    }

    return { kind: 'link', site: SITES[host] ?? host, href: raw };
}

/** What to put in the frame of the player: YouTube's privacy-friendly host, started by the person's touch (so with sound) */
export function youtubeEmbed(id: string, start: number): string {
    const query = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', ...(start > 0 ? { start: String(start) } : {}) });

    return `https://www.youtube-nocookie.com/embed/${id}?${query.toString()}`;
}

/** "1:15" for 75 seconds, "1:02:03" for an hour and more */
export function clock(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');

    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

function videoIdOf(host: string, url: URL): string | null {
    const parts = url.pathname.split('/').filter((part) => part !== '');
    const candidate = host === 'youtu.be'
        ? parts[0]
        : url.searchParams.get('v') ?? (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' ? parts[1] : undefined);

    return candidate !== undefined && VIDEO_ID.test(candidate) ? candidate : null;
}

/** The second a link starts at: "75", "75s", "1m15s", "1h2m3s"; 0 for anything else */
function startOf(text: string): number {
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(text.trim());
    if (match === null || text.trim() === '') {
        return 0;
    }
    const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);

    return Number.isFinite(seconds) && seconds < 86400 ? seconds : 0;
}
