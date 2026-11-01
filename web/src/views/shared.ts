import { ApiError, readShared } from '../api.ts';
import { transpose, type Notation } from '../chordpro/chord.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { h, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { readNotation } from '../prefs.ts';
import { planSheet } from '../print/plan.ts';
import type { PrintVersion } from '../print/layout.ts';
import { printPlans } from '../print/print.ts';
import { matchRoute, paths } from '../router.ts';
import { asSong, bySection, countLabel, keyOf, readingOrder, updatedLabel, type Row, type SharedList } from '../shared-model.ts';

/**
 * A list somebody shared, as a visitor reads it: no account, no menu, nothing to edit or save. It looks like the public
 * pages of Músicos Católicos (their header and footer, the list as the tracks of an album, the lyrics with the chord
 * over its syllable), which this app shares its colours and typefaces with. It loads nothing from another domain and
 * asks for nothing: no cookies, no analytics, no ads (the policy of the page forbids them, and the privacy text says so).
 *
 * The visitor's own choices (the key, the size of the lyrics) are theirs and last only while the page is open.
 */

const SITE = 'https://www.musicos-catolicos.com';
const LEGAL: readonly (readonly [string, string])[] = [
    ['Acerca de', '/acerca/'],
    ['Contacto', '/contacto/'],
    ['Privacidad', '/privacidad/'],
    ['Aviso legal', '/legal/'],
    ['Derechos de autor', '/derechos-de-autor/'],
];
/** What a visitor is told about the words, wherever they are shown */
const RIGHTS = 'Para uso personal. Las letras y los acordes pertenecen a sus autores.';
const SIZE_MIN = -2;
const SIZE_MAX = 4;

/** The public site's mark: a circle with a cross, drawn (not typed) so it is the same on every device */
const MARK = '<svg width="26" height="26" viewBox="0 0 28 28" fill="none" stroke-width="2" aria-hidden="true" focusable="false">'
    + '<circle cx="14" cy="14" r="12"/><path d="M14 6.5v15M9.5 11h9"/></svg>';

function external(href: string, ...children: (Node | string)[]): HTMLAnchorElement {
    return h('a', { href, target: '_blank', rel: 'noopener' }, ...children);
}

function header(): HTMLElement {
    const brand = h('a', { class: 'pub-brand', href: `${SITE}/`, target: '_blank', rel: 'noopener' });
    setSheet(brand, MARK);
    brand.append('Músicos Católicos');

    return h('header', { class: 'pub-head' }, h('div', { class: 'pub-wrap pub-head__inner' }, brand,
        h('nav', { class: 'pub-nav', 'aria-label': 'Principal' }, external(`${SITE}/`, 'Biografías'))));
}

function footer(): HTMLElement {
    return h('footer', { class: 'pub-foot' }, h('div', { class: 'pub-wrap pub-foot__inner' },
        h('nav', { 'aria-label': 'Pie de página' }, h('ul', { class: 'pub-foot__links' },
            ...LEGAL.map(([name, path]) => h('li', {}, external(`${SITE}${path}`, name))))),
        h('span', {}, `© ${new Date().getFullYear()} Músicos-Católicos.com`)));
}

/** A line under the lyrics, with the way to the page that says who the words belong to */
function rightsNote(): HTMLElement {
    return h('p', { class: 'pub-note' }, `${RIGHTS} `, external(`${SITE}/derechos-de-autor/`, 'Derechos de autor'));
}

/** "Imprimir": a small menu with the two sheets the public site offers, for the musicians (with chords) and to hand out */
function printMenu(print: (version: PrintVersion) => void): HTMLElement {
    const button = h('button', { type: 'button', class: 'pub-pill', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Imprimir' }, icon('printer', 20));
    const option = (label: string, hint: string, version: PrintVersion): HTMLElement => {
        const entry = h('button', { type: 'button', class: 'pub-print__option' }, label, h('small', {}, hint));
        entry.addEventListener('click', () => {
            menu.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            print(version);
        });

        return entry;
    };
    const menu = h('span', { class: 'pub-print__menu', hidden: true },
        option('Con acordes', 'para los músicos', 'chords'), option('Solo letra', 'para repartir', 'lyrics'));
    button.addEventListener('click', () => {
        menu.hidden = !menu.hidden;
        button.setAttribute('aria-expanded', String(!menu.hidden));
    });

    return h('span', { class: 'pub-print' }, button, menu);
}

/** What the page says while it works or when it cannot show the list: never a blank screen */
function message(text: string, ...extra: HTMLElement[]): HTMLElement {
    return h('div', { class: 'pub-gone' }, icon('link', 48), h('h1', {}, text), ...extra);
}

/**
 * Shows the shared list at `code` in `root` and keeps it while the visitor moves between the list and its songs
 * (`/c/:code` and `/c/:code/:n`: the addresses are real, so back and reload work).
 */
export function startShared(root: HTMLElement, code: string): void {
    // The app's frame is a screen of fixed height with a rail at the left; a visitor's page is a page that scrolls
    root.classList.add('is-public');
    let list: SharedList | null = null;

    const frame = (...content: (Node | string)[]): void => {
        root.replaceChildren(h('div', { class: 'pub' }, header(), h('main', { class: 'pub-main', id: 'main' }, h('div', { class: 'pub-wrap' }, ...content)), footer()));
        window.scrollTo(0, 0);
    };

    const listPage = (data: SharedList): HTMLElement => {
        const rows = readingOrder(data);
        const notation = readNotation();
        const print = (version: PrintVersion): void => {
            printPlans(rows.map((row) => planSheet(asSong(row.song, data.updatedAt), {
                version, shift: row.item.transpose, notation, part: row.part.name,
            }))).catch(() => undefined);
        };
        const body = h('div', { class: 'pub-list' });
        for (const group of bySection(rows)) {
            body.append(h('h2', { class: 'pub-sec' }, group.part.name));
            for (const row of group.rows) {
                const key = keyOf(row.song, row.item.transpose, notation);
                const text = [h('span', { class: 'pub-row__title' }, row.song.title),
                    ...(row.song.author === '' ? [] : [h('small', {}, row.song.author)])];
                body.append(data.withLyrics
                    ? h('a', { class: 'pub-row', href: paths.shared(code, row.n), 'data-link': true },
                        h('span', { class: 'pub-row__n' }, String(row.n)), h('span', { class: 'pub-row__text' }, ...text),
                        ...(key === null ? [] : [h('span', { class: 'pub-row__key' }, key)]), icon('chevron-right', 20))
                    : h('div', { class: 'pub-row is-plain' },
                        h('span', { class: 'pub-row__n' }, String(row.n)), h('span', { class: 'pub-row__text' }, ...text)));
            }
        }

        return h('div', { class: 'pub-page' },
            h('div', { class: 'pub-kick' }, h('span', {}, 'Listado compartido'), ...(data.withLyrics && rows.length > 0 ? [printMenu(print)] : [])),
            h('h1', { class: 'pub-title' }, data.title),
            h('p', { class: 'pub-sub' }, `${countLabel(rows.length)} · Actualizado el ${updatedLabel(data.updatedAt)}`),
            ...(data.withLyrics ? [] : [h('p', { class: 'pub-banner' }, icon('info', 20),
                h('span', {}, 'Quien lo compartió eligió mostrar solo el orden, sin letras ni acordes.'))]),
            ...(rows.length === 0 ? [h('p', { class: 'pub-sub' }, 'Este listado todavía no tiene cantos.')] : [body]),
            rightsNote());
    };

    const songPage = (data: SharedList, row: Row, rows: readonly Row[]): HTMLElement => {
        const notation: Notation = readNotation();
        const body = row.song.body ?? '';
        const parsed = parse(body);
        const original = songKey(parsed);
        /** The key on screen: the list's own until the visitor moves it */
        let t = row.item.transpose;
        let size = 0;
        const sheet = h('div', { class: 'song-sheet pub-sheet' });
        setSheet(sheet, sheetHtml(parsed));
        const chords = Array.from(sheet.querySelectorAll<HTMLElement>('.ch[data-chord]'));
        const keyText = h('b', {});
        const keyButton = h('button', { type: 'button', class: 'pub-tool pub-key', 'aria-label': 'Tono' }, h('small', {}, 'Tono'), keyText);
        const pillKey = h('b', {});
        const pill = h('button', { type: 'button', class: 'pub-pill pub-pill--key' }, 'Tono ', pillKey);
        const smaller = h('button', { type: 'button', class: 'pub-tool', 'aria-label': 'Letra más pequeña' }, 'A−');
        const bigger = h('button', { type: 'button', class: 'pub-tool', 'aria-label': 'Letra más grande' }, 'A+');
        const down = h('button', { type: 'button', class: 'pub-tool', 'aria-label': 'Bajar medio tono' }, '−');
        const up = h('button', { type: 'button', class: 'pub-tool', 'aria-label': 'Subir medio tono' }, '+');
        const live = h('span', { class: 'sr-only', 'aria-live': 'polite' });

        const update = (): void => {
            for (const chord of chords) {
                chord.textContent = transpose(chord.dataset['chord'] ?? '', t, notation);
            }
            const name = original === null ? null : transpose(original, t, notation);
            const changed = t !== row.item.transpose;
            keyText.textContent = name ?? '';
            pillKey.textContent = name ?? '';
            pill.hidden = name === null;
            keyButton.hidden = name === null;
            down.hidden = name === null;
            up.hidden = name === null;
            // Moved off the list's key: yellow and a way back, so it is clear the chords are not the list's
            keyButton.classList.toggle('is-changed', changed);
            pill.classList.toggle('is-changed', changed);
            keyButton.setAttribute('aria-label', changed ? `Tono ${name ?? ''}. Volver al tono del listado` : `Tono ${name ?? ''}`);
            live.textContent = name === null ? '' : `Tono: ${name}`;
            sheet.style.setProperty('--lyric-step', String(size));
            smaller.setAttribute('aria-disabled', String(size <= SIZE_MIN));
            bigger.setAttribute('aria-disabled', String(size >= SIZE_MAX));
        };
        down.addEventListener('click', () => { t = (t - 1) % 12; update(); });
        up.addEventListener('click', () => { t = (t + 1) % 12; update(); });
        for (const reset of [keyButton, pill]) {
            reset.addEventListener('click', () => { t = row.item.transpose; update(); });
        }
        smaller.addEventListener('click', () => { size = Math.max(SIZE_MIN, size - 1); update(); });
        bigger.addEventListener('click', () => { size = Math.min(SIZE_MAX, size + 1); update(); });
        update();

        const print = (version: PrintVersion): void => {
            printPlans([planSheet(asSong(row.song, data.updatedAt), { version, shift: t, notation, part: row.part.name })]).catch(() => undefined);
        };
        const before = rows[row.n - 2];
        const after = rows[row.n];
        const neighbour = (to: Row | undefined, label: string): HTMLElement =>
            to === undefined ? h('span', {}) : h('a', { href: paths.shared(code, to.n), 'data-link': true, class: 'pub-next' }, h('small', {}, label), to.song.title);

        return h('div', { class: 'pub-page' },
            h('div', { class: 'pub-kick' }, h('span', {}, `${row.part.name} · ${row.n} de ${rows.length}`),
                h('span', { class: 'pub-kick__tools' }, pill, printMenu(print))),
            h('h1', { class: 'pub-title' }, row.song.title),
            h('p', { class: 'pub-sub' }, ...(row.song.author === '' ? [] : [`${row.song.author} · `]),
                h('a', { href: paths.shared(code), 'data-link': true }, data.title)),
            h('div', { class: 'pub-tools', role: 'toolbar', 'aria-label': 'Herramientas de la letra' },
                h('div', { class: 'pub-tools__group' }, down, keyButton, up), h('div', { class: 'pub-tools__group' }, smaller, bigger), live),
            sheet,
            rightsNote(),
            h('nav', { class: 'pub-nexts', 'aria-label': 'Otros cantos del listado' }, neighbour(before, 'Anterior'), neighbour(after, 'Siguiente')));
    };

    const render = (): void => {
        if (list === null) {
            return;
        }
        document.title = `${list.title} · Músicos Católicos`;
        const route = matchRoute(location.pathname);
        const rows = readingOrder(list);
        const row = route.name === 'shared' && route.n !== undefined && list.withLyrics ? rows.find((candidate) => candidate.n === route.n) : undefined;
        frame(row === undefined ? listPage(list) : songPage(list, row, rows));
    };

    const load = (): void => {
        document.title = 'Listado compartido · Músicos Católicos';
        frame(h('p', { class: 'pub-wait', role: 'status' }, h('span', { class: 'spinner spinner--big', 'aria-hidden': 'true' }), 'Abriendo el listado…'));
        readShared(code)
            .then((data) => {
                list = data;
                render();
            })
            .catch((failure: unknown) => {
                const retry = h('button', { type: 'button', class: 'button' }, 'Reintentar');
                retry.addEventListener('click', load);
                if (failure instanceof ApiError && failure.status === 404) {
                    frame(message('Este enlace ya no existe', h('p', {}, 'Quien lo compartió pudo haberlo apagado. Pídele uno nuevo.')));
                } else if (failure instanceof ApiError && failure.isOffline) {
                    frame(message('Sin conexión', h('p', {}, 'Conéctate para ver este listado.'), retry));
                } else {
                    frame(message('No se pudo abrir el listado', h('p', {}, failure instanceof Error ? failure.message : 'Inténtalo de nuevo.'), retry));
                }
            });
    };

    // The addresses of the list and of its songs are real: a link moves inside the page, back and reload work
    root.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-link]');
        if (anchor !== null && anchor.origin === location.origin) {
            event.preventDefault();
            history.pushState(null, '', anchor.pathname);
            render();
        }
    });
    window.addEventListener('popstate', render);
    load();
}
