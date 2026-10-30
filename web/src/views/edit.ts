import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import type { Setlist, Song } from '../data/types.ts';
import { h, link, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { keyDistance, nearestShift } from '../keys.ts';
import { paths, type Placement } from '../router.ts';
import { todayKeys } from '../today-keys.ts';
import { showToast } from '../toast.ts';
import { transpose } from '../chordpro/chord.ts';
import { readNotation } from '../prefs.ts';
import type { Navigate, View } from './types.ts';

/** What the confirmation says before deleting a song, naming the lists it is in */
function deleteMessage(song: Song, lists: readonly Setlist[]): string {
    const base = `¿Eliminar “${song.title}”? No se puede deshacer.`;
    if (lists.length === 0) {
        return base;
    }
    const names = lists.map((list) => `“${list.title}”`).join(', ');
    const where = lists.length === 1 ? `el listado ${names}` : `${lists.length} listados (${names})`;

    return `${base}\n\nEste canto está en ${where}. Ahí aparecerá como «Canto eliminado» hasta que lo quites.`;
}

const HELP = `[C]Caminamos con a[G]legría, Señor,
cantando vamos hacia tu [Am]casa.

{c: Verso 1}
[C]Un pueblo que es[F]pera
{ci: x2}

{soc}
[G]Coro: las líneas entre {soc} y {eoc}
{eoc}`;

/** What a new song starts from: a title already typed, and the part of a list it is for */
export interface NewSongStart {
    title?: string;
    into?: Placement;
    /** A song being sung (`paths.perform`): where to come back to when the edit ends */
    back?: string;
}

/**
 * Creating and editing a song. The lyrics are ChordPro; the preview under the box is the same
 * rendering the song gets when it is read, so what is typed is what will be seen.
 *
 * A new song started from the picker of a part (`start.into`) is put in that part once saved, and
 * the person lands back on the list: the song they could not find is now in it.
 */
export function editView(app: App, navigate: Navigate, existing?: Song, start: NewSongStart = {}): View {
    const title = h('input', { id: 'title', name: 'title', type: 'text', required: true, autocomplete: 'off' });
    const author = h('input', { id: 'author', name: 'author', type: 'text', autocomplete: 'off' });
    const body = h('textarea', { id: 'body', name: 'body', class: 'mono', spellcheck: 'false', autocapitalize: 'off' });
    title.value = existing?.title ?? start.title ?? '';
    author.value = existing?.author ?? '';
    body.value = existing?.body ?? '';

    const error = h('p', { class: 'error', role: 'alert' });
    const keyChip = h('span', { class: 'chip', hidden: true });
    const sheet = h('div', { class: 'song-sheet' });
    const preview = h('section', { class: 'preview', 'aria-label': 'Vista previa' }, h('h3', {}, 'Vista previa '), keyChip, sheet);

    const draw = (): void => {
        const parsed = parse(body.value);
        setSheet(sheet, sheetHtml(parsed));
        const key = songKey(parsed);
        keyChip.hidden = key === null;
        keyChip.textContent = key === null ? '' : `Tono ${transpose(key, 0, readNotation())}`;
    };
    body.addEventListener('input', draw);
    draw();

    const save = h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar');
    const actions = h('div', { class: 'actions' }, save, link(cancelPath(existing, start.into, start.back), 'Cancelar', 'button'));
    if (existing !== undefined) {
        const remove = h('button', { type: 'button', class: 'button button--danger' }, 'Eliminar');
        remove.addEventListener('click', () => {
            // A song in a list stays there as "Canto eliminado": say so before it happens
            void app.setlists.using(existing.id).then((lists) => {
                if (confirm(deleteMessage(existing, lists))) {
                    void app.remove(existing.id).then(() => navigate(paths.list()));
                }
            });
        });
        actions.append(remove);
    }

    const form = h(
        'form',
        { class: 'form', novalidate: true },
        h('label', { for: 'title' }, 'Título'),
        title,
        h('label', { for: 'author' }, 'Autor (opcional)'),
        author,
        h('label', { for: 'body' }, 'Letra con acordes'),
        body,
        h(
            'details',
            { class: 'help' },
            h('summary', {}, 'Cómo escribir los acordes'),
            h('p', {}, 'Los acordes van entre corchetes, justo antes de la sílaba donde cambian. Puedes escribirlos en cifrado americano (C, Am, F#m7) o en español (Do, Lam, Fa#m7).'),
            h('pre', {}, HELP),
            h('p', {}, '{c: Coro} abre una sección con nombre; {soc} … {eoc} es un coro; {ci: x2} es una nota en cursiva. Las líneas que empiezan con # no se muestran.'),
        ),
        error,
        actions,
    );

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        save.disabled = true;
        const draft = { title: title.value, author: author.value, body: body.value };
        const saved = existing === undefined ? app.create(draft) : saveEdit(app, existing, draft);
        saved
            .then((song) => {
                if (existing === undefined && start.into !== undefined) {
                    return placeInPart(app, navigate, song, start.into);
                }

                // Back to the song being sung, replacing this screen so "back" does not return to the form
                return start.back !== undefined ? navigate(start.back, { replace: true }) : navigate(paths.view(song.id));
            })
            .catch((failure: unknown) => {
                error.textContent = failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.';
                save.disabled = false;
            });
    });

    // What editing a song that is already used means, one line each (the text opens with its button)
    const notices = h('div', { class: 'notices' });
    if (existing !== undefined) {
        const own = songKey(parse(existing.body));
        const scope = notice('', false);
        void app.setlists.using(existing.id).then((lists) => {
            if (lists.length > 0) {
                const count = lists.length === 1 ? '1 listado' : `${lists.length} listados`;
                scope.set([`Está en `, h('b', {}, count), ': los cambios de letra y acordes van a todos'],
                    `${lists.map((list) => `«${list.title}»`).join(', ')}. El tono se cambia aparte, desde Cantar.`);
                notices.prepend(scope.element);
            }
        });
        const moved = notice('', true);
        body.addEventListener('input', () => {
            const now = songKey(parse(body.value));
            const by = keyDistance(own, now);
            if (own !== null && now !== null && by !== null && by !== 0) {
                moved.set(['El tono original pasó de ', h('b', {}, transpose(own, 0, readNotation())), ' a ', h('b', {}, transpose(now, 0, readNotation()))],
                    'Lo que cantas no cambia: tu tono y el de cada listado se ajustan solos para sonar igual que antes.');
                notices.append(moved.element);
            } else {
                moved.element.remove();
            }
        });
    }

    const element = h('div', { class: 'page' }, h('h2', {}, existing === undefined ? 'Nuevo canto' : 'Editar canto'), notices, form, preview);
    // With the title already typed from the search, the lyrics are what is missing
    queueMicrotask(() => (existing === undefined && title.value === '' ? title : body).focus());

    return { element };
}

/**
 * Saves an edit. If it moved the key the song is written in, the keys people sing it in move the other way,
 * so editing a chart never changes what is sung (and the keys of today, which live on this device, with them).
 */
async function saveEdit(app: App, existing: Song, draft: { title: string; author: string; body: string }): Promise<Song> {
    const moved = keyDistance(songKey(parse(existing.body)), songKey(parse(draft.body))) ?? 0;
    const { song, touched } = await app.updateKeepingKeys(existing.id, draft, moved);
    for (const { setlistId, itemId } of touched) {
        const today = todayKeys.get(setlistId, itemId);
        if (today !== null) {
            todayKeys.set(setlistId, itemId, nearestShift(today - moved));
        }
    }

    return song;
}

/** A line with a button that opens its explanation: the short fact stays in view, the why is one touch away */
function notice(text: string, tone: boolean): { element: HTMLElement; set: (summary: Array<Node | string>, details: string) => void } {
    const summary = h('span', { class: 'notice-line__text' }, text);
    const details = h('p', { class: 'notice-line__details', hidden: true });
    const button = h('button', { type: 'button', class: 'notice-line__info', 'aria-label': 'Más información', 'aria-expanded': 'false' }, icon('info', 20));
    button.addEventListener('click', () => {
        details.hidden = !details.hidden;
        button.setAttribute('aria-expanded', String(!details.hidden));
    });
    const element = h('div', { class: tone ? 'notice-line notice-line--tone' : 'notice-line' }, h('div', { class: 'notice-line__row' }, summary, button), details);

    return {
        element,
        set: (parts, why) => {
            summary.replaceChildren(...parts);
            details.textContent = why;
        },
    };
}

function cancelPath(existing: Song | undefined, into: Placement | undefined, back: string | undefined): string {
    if (existing !== undefined) {
        return back ?? paths.view(existing.id);
    }

    return into === undefined ? paths.list() : paths.addToSetlist(into.setlist, into.part);
}

/**
 * Puts a song just written into the part it was written for and opens the list there. The song is
 * already saved: if the list refuses it (full, or deleted meanwhile) the person is told and keeps the song.
 */
async function placeInPart(app: App, navigate: Navigate, song: Song, into: Placement): Promise<void> {
    try {
        await app.setlists.addItem(into.setlist, into.part, song.id);
    } catch (failure) {
        const reason = failure instanceof Error ? failure.message : 'No se pudo agregar al listado.';
        showToast(`“${song.title}” se guardó, pero no se agregó al listado: ${reason}`, 6000, true);
        navigate(paths.view(song.id));

        return;
    }
    navigate(`${paths.setlist(into.setlist)}#parte-${into.part}`, { replace: true });
}
