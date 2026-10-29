import type { App } from '../app.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import type { Setlist, Song } from '../data/types.ts';
import { h, link, setSheet } from '../dom.ts';
import { paths, type Placement } from '../router.ts';
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
    const actions = h('div', { class: 'actions' }, save, link(cancelPath(existing, start.into), 'Cancelar', 'button'));
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
        const saved = existing === undefined ? app.create(draft) : app.update(existing.id, draft);
        saved
            .then((song) => (existing === undefined && start.into !== undefined ? placeInPart(app, navigate, song, start.into) : navigate(paths.view(song.id))))
            .catch((failure: unknown) => {
                error.textContent = failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.';
                save.disabled = false;
            });
    });

    const element = h('div', { class: 'page' }, h('h2', {}, existing === undefined ? 'Nuevo canto' : 'Editar canto'), form, preview);
    // With the title already typed from the search, the lyrics are what is missing
    queueMicrotask(() => (existing === undefined && title.value === '' ? title : body).focus());

    return { element };
}

function cancelPath(existing: Song | undefined, into: Placement | undefined): string {
    if (existing !== undefined) {
        return paths.view(existing.id);
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
