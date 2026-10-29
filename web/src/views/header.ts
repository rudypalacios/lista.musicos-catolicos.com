import type { Status } from '../app.ts';
import { h, link } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { parentOf, paths, sectionOf, titleOf, type Route } from '../router.ts';
import { describeSync, showsLine } from '../sync-line.ts';

export interface Header {
    /** The bar and, under it, the line that speaks only when the sync needs attention */
    top: HTMLElement[];
    /** The menu: at the bottom of a phone, at the left of a wide screen */
    menu: HTMLElement;
    /** Shows the name or the way back that suits the screen; away entirely while singing */
    setRoute: (route: Route) => void;
    paint: (status: Status) => void;
}

export interface HeaderOptions {
    email: string;
    /** Syncs now; the dot in the bar does this when touched */
    onSync: () => void;
    /** Asks to sign out (it asks first when something was never sent) */
    onSignOut: () => void;
    /** The session ended: lets the person sign in again */
    onNeedsSignIn: () => void;
}

const ENTRIES: ReadonlyArray<{ section: 'songs' | 'lists' | 'settings'; label: string; path: string; glyph: IconName }> = [
    { section: 'songs', label: 'Cantos', path: paths.list(), glyph: 'music' },
    { section: 'lists', label: 'Listados', path: paths.lists(), glyph: 'list' },
    { section: 'settings', label: 'Ajustes', path: paths.settings(), glyph: 'settings' },
];

/**
 * The frame's menu and bar. The menu has three entries (Cantos, Listados, Ajustes): at the bottom of
 * a phone, where the thumb is, and only on the screens of the menu itself (a song or a list takes the
 * whole height and has its way back); at the left of a wide screen, always there. The bar says the
 * name of the screen, or on a screen that hangs from another, the way back to it, and holds a dot
 * for the sync: it says nothing while all is sent, a line under the bar speaks when something is
 * wrong, and touching it syncs now. The account (email, Salir) lives in Ajustes, and at the foot of
 * the menu on a wide screen.
 */
export function createHeader(options: HeaderOptions): Header {
    const title = h('b', { class: 'bar__title' });
    const back = link(paths.list(), '', 'bar__back');
    back.hidden = true;
    const dot = h('button', { type: 'button', class: 'sync-dot' }, h('span', { class: 'sync-dot__mark', 'aria-hidden': 'true' }));
    dot.addEventListener('click', options.onSync);
    const bar = h('header', { class: 'bar bar--shell' }, title, back, dot);

    const text = h('span', { class: 'sync' });
    const renew = h('button', { type: 'button', class: 'link', hidden: true }, 'Iniciar sesión');
    renew.addEventListener('click', options.onNeedsSignIn);
    const line = h('div', { class: 'sync-line', role: 'status', 'aria-live': 'polite', hidden: true }, text, renew);
    /** The line shows when the sync has something to say, and never while singing (the song has the room) */
    let speaks = false;
    let away = false;
    const drawLine = (): void => {
        line.hidden = away || !speaks;
    };

    const entries = ENTRIES.map((entry) => ({
        entry,
        element: h('a', { href: entry.path, class: 'menu__entry', 'data-link': true, 'data-section': entry.section },
            icon(entry.glyph, 22), h('span', {}, entry.label)),
    }));
    const signOut = h('button', { type: 'button', class: 'link' }, 'Salir');
    signOut.addEventListener('click', options.onSignOut);
    const menu = h('nav', { class: 'menu', 'aria-label': 'Menú' },
        h('span', { class: 'menu__brand' }, 'Lista'),
        ...entries.map(({ element }) => element),
        h('div', { class: 'menu__foot' }, h('span', { class: 'menu__email' }, options.email), signOut));

    return {
        top: [bar, line],
        menu,
        setRoute: (route) => {
            const singing = route.name === 'perform';
            const parent = parentOf(route);
            bar.hidden = singing;
            menu.hidden = singing;
            // On a phone the menu is only on the screens of the menu; on a wide screen it is always there
            menu.dataset['root'] = String(parent === null);
            away = singing;
            drawLine();
            title.hidden = parent !== null;
            title.textContent = titleOf(route);
            back.hidden = parent === null;
            if (parent !== null) {
                back.href = parent.path;
                back.textContent = `← ${parent.label}`;
            }
            const section = sectionOf(route);
            for (const { entry, element } of entries) {
                if (entry.section === section) {
                    element.setAttribute('aria-current', 'page');
                } else {
                    element.removeAttribute('aria-current');
                }
            }
        },
        paint: (status) => {
            const { text: said, tone } = describeSync(status);
            text.textContent = said;
            dot.className = `sync-dot sync-dot--${tone}`;
            dot.setAttribute('aria-label', `${said}. Toca para sincronizar ahora`);
            dot.title = said;
            line.className = `sync-line sync-line--${tone}`;
            speaks = showsLine(tone);
            drawLine();
            renew.hidden = status.state !== 'signed-out';
        },
    };
}
