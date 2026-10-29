import type { Status } from '../app.ts';
import { h, link } from '../dom.ts';
import { parentOf, paths, sectionOf, type Route } from '../router.ts';
import { describeSync, showsLine } from '../sync-line.ts';
import { createSheet } from './sheet.ts';
import type { Navigate } from './types.ts';

export interface Header {
    /** The bar and, under it, the line that speaks only when the sync needs attention */
    elements: HTMLElement[];
    /** Shows the tabs or the way back that suit the screen; away entirely while singing */
    setRoute: (route: Route) => void;
    paint: (status: Status) => void;
}

export interface HeaderOptions {
    email: string;
    navigate: Navigate;
    /** Syncs now; the dot in the bar does this when touched */
    onSync: () => void;
    /** Asks to sign out (it asks first when something was never sent) */
    onSignOut: () => void;
    /** The session ended: lets the person sign in again */
    onNeedsSignIn: () => void;
}

/**
 * The frame's one header: on a screen of a section the two tabs (Cantos, Listados); on a screen
 * that hangs from another, the way back to it. At the right, a dot for the sync (it says
 * nothing while all is sent, and a line under the bar speaks when something is wrong) and the
 * account menu with Ajustes, the install guide and Salir. The name of the screen is not
 * repeated anywhere else.
 */
export function createHeader(options: HeaderOptions): Header {
    const songsTab = h('a', { href: paths.list(), 'data-link': true, 'data-section': 'songs' }, 'Cantos');
    const listsTab = h('a', { href: paths.lists(), 'data-link': true, 'data-section': 'lists' }, 'Listados');
    const tabs = h('nav', { class: 'tabs', 'aria-label': 'Secciones' }, songsTab, listsTab);
    const back = link(paths.list(), '', 'bar__back');
    back.hidden = true;

    const dot = h('button', { type: 'button', class: 'sync-dot' }, h('span', { class: 'sync-dot__mark', 'aria-hidden': 'true' }));
    dot.addEventListener('click', options.onSync);
    const initial = Array.from(options.email.trim())[0]?.toUpperCase() ?? '?';
    const avatar = h('button', {
        type: 'button', class: 'avatar-button', 'aria-label': `Cuenta de ${options.email}`, 'aria-haspopup': 'dialog',
    }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, initial));
    const bar = h('header', { class: 'bar bar--shell' }, tabs, back, dot, avatar);

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

    // The account: a sheet, as the other menus of the app, so the back button of the phone closes it
    const account = createSheet('Cuenta');
    account.element.classList.add('sheet-layer--window');
    const goTo = (path: string): ((click: Event) => void) => (click) => {
        click.preventDefault();
        account.close(() => options.navigate(path));
    };
    const settings = link(paths.settings(), 'Ajustes', 'button');
    settings.addEventListener('click', goTo(paths.settings()));
    const guide = link(paths.install(), 'Cómo instalar la app', 'button');
    guide.addEventListener('click', goTo(paths.install()));
    const signOut = h('button', { type: 'button', class: 'button button--danger' }, 'Salir');
    signOut.addEventListener('click', () => account.close(options.onSignOut));
    account.body.append(
        h('h3', { class: 'sheet__title' }, 'Cuenta'),
        h('p', { class: 'sheet__sub' }, options.email),
        h('div', { class: 'account-actions' }, settings, guide, signOut),
    );
    avatar.addEventListener('click', account.open);

    return {
        elements: [bar, line, account.element],
        setRoute: (route) => {
            const singing = route.name === 'perform';
            bar.hidden = singing;
            away = singing;
            drawLine();
            const parent = parentOf(route);
            tabs.hidden = parent !== null;
            back.hidden = parent === null;
            if (parent !== null) {
                back.href = parent.path;
                back.textContent = `← ${parent.label}`;
            }
            const section = sectionOf(route);
            for (const tab of [songsTab, listsTab]) {
                if (tab.dataset['section'] === section) {
                    tab.setAttribute('aria-current', 'page');
                } else {
                    tab.removeAttribute('aria-current');
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
