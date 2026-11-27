import { api } from '../api.ts';
import { h } from '../dom.ts';
import { paths } from '../router.ts';

const NS = 'http://www.w3.org/2000/svg';

/** Where the browser is sent to start: a page of the server that sends it on to Google (not a call of the app) */
export const GOOGLE_START = '/api/google/start';

/**
 * Google's "G", as its brand rules ask (four colours, the same on every device). It is drawn, not a character of a font.
 */
function googleMark(): SVGSVGElement {
    const svg = document.createElementNS(NS, 'svg');
    for (const [key, value] of Object.entries({
        width: '20', height: '20', viewBox: '0 0 48 48', 'aria-hidden': 'true', focusable: 'false', class: 'icon google-button__mark',
    })) {
        svg.setAttribute(key, value);
    }
    for (const [fill, d] of [
        ['#EA4335', 'M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'],
        ['#4285F4', 'M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'],
        ['#FBBC05', 'M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'],
        ['#34A853', 'M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'],
    ] as const) {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('fill', fill);
        path.setAttribute('d', d);
        svg.append(path);
    }

    return svg;
}

/** Asked once per page load; a failure is not remembered, so coming back online shows the button the next time */
let offered: Promise<boolean> | null = null;

function googleOffered(): Promise<boolean> {
    offered ??= api.authOptions().then(
        (options) => options.google,
        () => {
            offered = null;

            return false;
        },
    );

    return offered;
}

/**
 * "Continuar con Google", for the forms that sign in or sign up. It is a link to the server, which sends the person to
 * Google and brings them back (nothing of Google is loaded in this page). It stays out of sight until the server says it
 * offers Google, so a server without it set up, or a device with no connection, shows nothing that cannot work. Creating an
 * account this way is also agreeing to how the data is used, so the line under it says so and links to it.
 */
export function googleOption(options: { separator?: boolean } = {}): HTMLElement {
    const start = h('a', { class: 'button google-button', href: GOOGLE_START }, googleMark(), 'Continuar con Google');
    const option = h('div', { class: 'google-option', hidden: true },
        ...(options.separator === true ? [h('p', { class: 'google-option__or muted', 'aria-hidden': 'true' }, 'o')] : []),
        start,
        h('p', { class: 'muted google-option__note' }, 'Al continuar con Google aceptas cómo se usan tus datos: ',
            h('a', { href: paths.privacy(), target: '_blank', rel: 'noopener' }, 'Privacidad'), '.'));
    void googleOffered().then((yes) => {
        option.hidden = !yes;
    });

    return option;
}
