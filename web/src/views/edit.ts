import type { App } from '../app.ts';
import { capitaliseChords } from '../chordpro/capitalise.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError, type SongDraft } from '../data/library.ts';
import { partsOf } from '../data/setlists.ts';
import { sameTag, tagOf, tagsInUse } from '../data/tags.ts';
import { MASS_PARTS } from '../mass.ts';
import { createTagField } from './tag-field.ts';
import { convertPastedSheet } from '../importer.ts';
import type { Song } from '../data/types.ts';
import { h, link, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { keyDistance } from '../keys.ts';
import { retuneTodayKeys } from '../transpose-song.ts';
import { paths, type Placement } from '../router.ts';
import { newSongDraft } from '../song-draft.ts';
import { showToast } from '../toast.ts';
import { deleteSongAfterAsking } from './delete-song.ts';
import { transpose } from '../chordpro/chord.ts';
import { readNotation } from '../prefs.ts';
import type { Navigate, View } from './types.ts';

const HELP = `[C]Caminamos con a[G]legría, Señor,
cantando vamos hacia tu [Am]casa.

{c: Verso 1}
[C]Un pueblo que es[F]pera
{ci: x2}

{soc}
[G]Coro: las líneas entre {soc} y {eoc}
{eoc}`;

/** How long after the last key pressed the draft is kept (ms): not at every letter of a long lyric */
const DRAFT_DELAY = 500;

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

    // The tags: below the lyrics and optional. Offered: the ones in use, then the Mass's (what a section asks for)
    let known: string[] = MASS_PARTS.map((part) => part.tag);
    const tagField = createTagField({ initial: existing?.tags ?? [], suggestions: () => known });
    void app.list().then((songs) => {
        const inUse = tagsInUse(songs);
        known = [...inUse, ...known.filter((tag) => !inUse.some((used) => sameTag(used, tag)))];
        tagField.refresh();
    });
    // A song written for a section starts with that section's tag: it is the one it was missing when it was searched for
    if (existing === undefined && start.into !== undefined) {
        const { setlist: setlistId, part: partId } = start.into;
        void app.setlists.get(setlistId).then((list) => {
            const part = list === undefined ? undefined : partsOf(list).find((candidate) => candidate.id === partId);
            if (part !== undefined && tagField.value().length === 0) {
                tagField.set([tagOf(part)]);
            }
        });
    }

    const error = h('p', { class: 'error', role: 'alert' });
    const titleError = h('p', { class: 'error field-error', id: 'title-error', role: 'alert' });
    title.setAttribute('aria-describedby', 'title-error');
    // The message and the mark go as soon as the person starts to fix the title
    title.addEventListener('input', () => {
        titleError.textContent = '';
        title.removeAttribute('aria-invalid');
    });
    const keyChip = h('span', { class: 'chip', hidden: true });
    const sheet = h('div', { class: 'song-sheet' });
    const preview = h('section', { class: 'preview', 'aria-label': 'Vista previa' }, h('h3', {}, 'Vista previa '), keyChip, sheet);

    const draw = (): void => {
        // What is previewed is what is saved: a chord typed [c] is read as [C]
        const parsed = parse(capitaliseChords(body.value));
        setSheet(sheet, sheetHtml(parsed));
        const key = songKey(parsed);
        keyChip.hidden = key === null;
        keyChip.textContent = key === null ? '' : `Tono ${transpose(key, 0, readNotation())}`;
    };
    body.addEventListener('input', draw);
    // Leaving the box writes the capitals for real (not while typing: the text under the cursor would jump)
    body.addEventListener('change', () => {
        body.value = capitaliseChords(body.value);
    });
    draw();

    const save = h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar');
    const cancel = link(cancelPath(existing, start.into, start.back), 'Cancelar', 'button');
    // Always in view (the keyboard and a long song push the end of the form out of sight)
    const foot = h('div', { class: 'actions edit-foot' }, save, cancel);

    // ----- the draft: what was written and not saved is kept on the device, for a song that does not exist yet -----
    // Started from the picker of a part the song is for that part and that title: a draft is not mixed in
    const keepsDraft = existing === undefined && start.into === undefined && (start.title ?? '') === '';
    let discarded = false;
    let keepTimer: ReturnType<typeof setTimeout> | undefined;
    const keepNow = (): void => {
        clearTimeout(keepTimer);
        keepTimer = undefined;
        if (keepsDraft && !discarded) {
            newSongDraft.keep({ title: title.value, author: author.value, body: body.value });
        }
    };
    const keepSoon = (): void => {
        if (keepsDraft) {
            clearTimeout(keepTimer);
            keepTimer = setTimeout(keepNow, DRAFT_DELAY);
        }
    };
    /** The song was saved or the person said they do not want it: nothing more is kept */
    const dropDraft = (): void => {
        discarded = true;
        clearTimeout(keepTimer);
        newSongDraft.clear();
    };
    // Closing the app or switching to another one gives no later chance
    const keepWhenHidden = (): void => {
        if (document.visibilityState === 'hidden') {
            keepNow();
        }
    };
    if (keepsDraft) {
        for (const field of [title, author, body]) {
            field.addEventListener('input', keepSoon);
        }
        body.addEventListener('change', keepSoon);
        window.addEventListener('pagehide', keepNow);
        document.addEventListener('visibilitychange', keepWhenHidden);
        cancel.addEventListener('click', dropDraft);
    }

    const recovered = h('div', { class: 'note-bar note-bar--draft', role: 'status', hidden: true });
    const discard = h('button', { type: 'button', class: 'note-bar__action' }, 'Descartar');
    recovered.append(h('span', {}, 'Borrador recuperado'), discard);
    const resumed = keepsDraft ? newSongDraft.load() : null;
    if (resumed !== null) {
        title.value = resumed.title;
        author.value = resumed.author;
        body.value = resumed.body;
        recovered.hidden = false;
        draw();
    }
    discard.addEventListener('click', () => {
        newSongDraft.clear();
        clearTimeout(keepTimer);
        title.value = '';
        author.value = '';
        body.value = '';
        recovered.hidden = true;
        draw();
        title.focus();
    });

    // ----- a sheet pasted with the chords above the words is converted, once, and says so -----
    const converted = h('div', { class: 'note-bar note-bar--ok', role: 'status', hidden: true });
    const undo = h('button', { type: 'button', class: 'note-bar__action' }, 'Deshacer');
    const convertedText = h('span', {});
    converted.append(convertedText, undo);
    let revert: (() => void) | null = null;
    body.addEventListener('paste', (event) => {
        const raw = event.clipboardData?.getData('text/plain') ?? '';
        const sheet = convertPastedSheet(raw);
        if (sheet === null) {
            return;
        }
        event.preventDefault();
        const before = body.value;
        const from = body.selectionStart;
        const to = body.selectionEnd;
        // A header on the sheet ("ENTRADA: Caminamos") gives the title and the author, where they are still empty
        const fillsTitle = title.value.trim() === '' && sheet.title !== '';
        const fillsAuthor = author.value.trim() === '' && sheet.author !== '';
        body.setRangeText(sheet.body, from, to, 'end');
        if (fillsTitle) {
            title.value = sheet.title;
        }
        if (fillsAuthor) {
            author.value = sheet.author;
        }
        convertedText.textContent = sheet.chords === 1 ? '1 acorde convertido' : `${sheet.chords} acordes convertidos`;
        converted.hidden = false;
        revert = () => {
            body.value = before.slice(0, from) + raw + before.slice(to);
            body.setSelectionRange(from + raw.length, from + raw.length);
            if (fillsTitle) {
                title.value = '';
            }
            if (fillsAuthor) {
                author.value = '';
            }
        };
        draw();
        keepSoon();
    });
    undo.addEventListener('click', () => {
        revert?.();
        revert = null;
        converted.hidden = true;
        draw();
        keepSoon();
        body.focus();
    });
    // The offer is for the paste just made: once the text is edited there is nothing to give back
    body.addEventListener('input', () => {
        converted.hidden = true;
        revert = null;
    });

    // ----- on a phone the lyrics and their preview share the screen by turns; from 900px they sit side by side -----
    const writeTab = h('button', { type: 'button', role: 'tab', id: 'tab-write', 'aria-controls': 'pane-write', 'aria-selected': 'true' }, 'Escribir');
    const seeTab = h('button', { type: 'button', role: 'tab', id: 'tab-see', 'aria-controls': 'pane-see', 'aria-selected': 'false' }, 'Ver');
    const switcher = h('div', { class: 'pane-switch', role: 'tablist', 'aria-label': 'Escribir o ver cómo queda' }, writeTab, seeTab);
    const writePane = h('div', { class: 'edit-pane edit-pane--write', id: 'pane-write', role: 'tabpanel', 'aria-labelledby': 'tab-write' });
    const seePane = h('div', { class: 'edit-pane edit-pane--see', id: 'pane-see', role: 'tabpanel', 'aria-labelledby': 'tab-see' }, preview);
    const panes = h('div', { class: 'edit-panes', 'data-pane': 'write' }, writePane, seePane);
    const showPane = (pane: 'write' | 'see'): void => {
        panes.dataset['pane'] = pane;
        writeTab.setAttribute('aria-selected', String(pane === 'write'));
        seeTab.setAttribute('aria-selected', String(pane === 'see'));
    };
    writeTab.addEventListener('click', () => showPane('write'));
    seeTab.addEventListener('click', () => showPane('see'));

    writePane.append(
        h('label', { for: 'body' }, 'Letra con acordes'),
        body,
        converted,
        tagField.element,
        h(
            'details',
            { class: 'help' },
            h('summary', {}, 'Cómo escribir los acordes'),
            h('p', {}, 'Los acordes van entre corchetes, justo antes de la sílaba donde cambian. Puedes escribirlos en cifrado americano (C, Am, F#m7) o en español (Do, Lam, Fa#m7).'),
            h('pre', {}, HELP),
            h('p', {}, '{c: Coro} abre una sección con nombre; {soc} … {eoc} es un coro; {ci: x2} es una nota en cursiva. Las líneas que empiezan con # no se muestran.'),
            h('p', {}, 'También puedes pegar una hoja con los acordes en una línea arriba de la letra: se convierte sola.'),
        ),
    );
    // Deleting stays under the lyrics, away from Guardar
    if (existing !== undefined) {
        const remove = h('button', { type: 'button', class: 'button button--danger edit-remove' }, 'Eliminar');
        remove.addEventListener('click', () => {
            // A song in a list stays there as "Canto eliminado": the question says so before it happens
            deleteSongAfterAsking(app, existing)
                .then((deleted) => (deleted ? navigate(paths.list()) : undefined))
                .catch(() => showToast('No se pudo eliminar el canto.', 4000, true));
        });
        writePane.append(remove);
    }

    const form = h(
        'form',
        { class: 'form form--edit', novalidate: true },
        h('label', { for: 'title' }, 'Título'),
        title,
        titleError,
        h('label', { for: 'author' }, 'Autor (opcional)'),
        author,
        switcher,
        panes,
        error,
        foot,
    );

    // From 900px "Eliminar" rides in the foot, level with Guardar and Cancelar (on a phone it stays under the
    // lyrics, away from Guardar). It is the same button: only where it sits changes. A new song has none.
    const removeButton = writePane.querySelector<HTMLElement>('.edit-remove');
    const wide = window.matchMedia('(min-width: 900px)');
    const placeRemove = (): void => {
        if (removeButton === null) {
            return;
        }
        if (wide.matches) {
            foot.prepend(removeButton);
        } else {
            writePane.append(removeButton);
        }
    };
    placeRemove();
    wide.addEventListener('change', placeRemove);

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        // Said at the field, which gets the focus: with the keyboard open the buttons are out of sight
        if (title.value.trim() === '') {
            titleError.textContent = 'El canto necesita un título.';
            title.setAttribute('aria-invalid', 'true');
            title.focus();

            return;
        }
        save.disabled = true;
        body.value = capitaliseChords(body.value);
        const draft: SongDraft = { title: title.value, author: author.value, body: body.value, tags: tagField.value() };
        const saved = existing === undefined ? app.create(draft) : saveEdit(app, existing, draft);
        saved
            .then((song) => {
                dropDraft();
                // Allowed (a title first, the lyrics later), but not in silence
                if (song.body.trim() === '') {
                    showToast(`“${song.title}” se guardó sin letra todavía.`, 4000, true);
                }
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
            const now = songKey(parse(capitaliseChords(body.value)));
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

    const element = h('div', { class: 'page page--edit' }, h('h2', {}, existing === undefined ? 'Nuevo canto' : 'Editar canto'), recovered, notices, form);
    // With the title already typed (from the search, or a draft), the lyrics are what is missing
    queueMicrotask(() => (existing === undefined && title.value === '' ? title : body).focus());

    return {
        element,
        dispose: () => {
            keepNow();
            wide.removeEventListener('change', placeRemove);
            window.removeEventListener('pagehide', keepNow);
            document.removeEventListener('visibilitychange', keepWhenHidden);
        },
    };
}

/**
 * Saves an edit. If it moved the key the song is written in, the keys people sing it in move the other way,
 * so editing a chart never changes what is sung (and the keys of today, which live on this device, with them).
 */
async function saveEdit(app: App, existing: Song, draft: SongDraft): Promise<Song> {
    const moved = keyDistance(songKey(parse(existing.body)), songKey(parse(draft.body))) ?? 0;
    const { song, touched } = await app.updateKeepingKeys(existing.id, draft, moved);
    retuneTodayKeys(touched, moved);

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
