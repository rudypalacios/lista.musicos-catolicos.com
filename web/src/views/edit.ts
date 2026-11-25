import type { App } from '../app.ts';
import { capitaliseChords } from '../chordpro/capitalise.ts';
import { transposeBody } from '../chordpro/transpose-body.ts';
import { parse, songKey } from '../chordpro/parser.ts';
import { editSheet, markPlaces } from '../chordpro/edit-sheet.ts';
import { setChordAt, type Piece } from '../chordpro/places.ts';
import { insertItem, type InsertKind } from '../chordpro/insert.ts';
import { changeCaseInRange, type CaseMode } from '../chordpro/letter-case.ts';
import { ValidationError, type SongDraft } from '../data/library.ts';
import { partsOf } from '../data/setlists.ts';
import { sameTag, tagOf, tagsInUse } from '../data/tags.ts';
import { MASS_PARTS } from '../mass.ts';
import { createChordSheet } from './chord-sheet.ts';
import { chooseDialog } from './confirm-dialog.ts';
import { createLyricsToolbar } from './lyrics-toolbar.ts';
import { createTagField } from './tag-field.ts';
import { convertPastedSheet } from '../importer.ts';
import type { Song } from '../data/types.ts';
import { h, link, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { clock, readListenUrl } from '../listen-url.ts';
import { keyDistance } from '../keys.ts';
import { retuneTodayKeys } from '../transpose-song.ts';
import { setLeaveGuard } from '../leave-guard.ts';
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

/** Characters from which the preview is drawn once per frame, not at every input (about 70 lines of lyrics) */
const LONG_TEXT = 3000;

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
    // A link to hear the original: it is opened from the page of the song (`views/listen.ts`)
    const listenUrl = h('input', { id: 'listen-url', name: 'listenUrl', type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://', 'aria-describedby': 'listen-hint' });
    listenUrl.value = existing?.listenUrl ?? '';
    const listenHint = h('p', { class: 'muted listen-hint', id: 'listen-hint', 'aria-live': 'polite' });
    const showListenHint = (): void => {
        const read = readListenUrl(listenUrl.value);
        listenHint.className = `muted listen-hint${read.kind === 'youtube' ? ' listen-hint--ok' : read.kind === 'link' ? ' listen-hint--link' : read.kind === 'bad' ? ' listen-hint--bad' : ''}`;
        listenHint.textContent = read.kind === 'none' ? 'Opcional. Pega el enlace del canto original para escucharlo desde su página.'
            : read.kind === 'bad' ? read.why
                : read.kind === 'link' ? `${read.site}: se abrirá aparte (no se puede reproducir dentro de Lista).`
                    : `Listo: ${read.site}${read.start > 0 ? `, arranca en ${clock(read.start)}` : ''}. Se podrá escuchar aquí.`;
    };
    listenUrl.addEventListener('input', showListenHint);
    showListenHint();

    // The tags: below the lyrics and optional. Offered: the ones in use, then the Mass's (what a section asks for)
    let known: string[] = MASS_PARTS.map((part) => part.tag);
    const tagField = createTagField({ initial: existing?.tags ?? [], suggestions: () => known });
    void app.list().then((songs) => {
        const inUse = tagsInUse(songs);
        known = [...inUse, ...known.filter((tag) => !inUse.some((used) => sameTag(used, tag)))];
        tagField.refresh();
    });
    // What the form held when it opened, to know whether the person changed anything (`isDirty`, below)
    let baseline = '';
    let saved = false;
    // A song written for a section starts with that section's tag: it is the one it was missing when it was searched for
    if (existing === undefined && start.into !== undefined) {
        const { setlist: setlistId, part: partId } = start.into;
        void app.setlists.get(setlistId).then((list) => {
            const part = list === undefined ? undefined : partsOf(list).find((candidate) => candidate.id === partId);
            if (part !== undefined && tagField.value().length === 0) {
                // The tag the section gives is not something the person changed: an untouched form stays untouched
                const untouched = !isDirty();
                tagField.set([tagOf(part)]);
                if (untouched) {
                    baseline = snapshot();
                }
            }
        });
    }

    // The state: a draft is marked "Borrador" in every list until it is published (a new song starts as a draft, to be checked first)
    const draftBox = h('input', { id: 'song-draft', type: 'checkbox' });
    draftBox.checked = existing === undefined || existing.status === 'draft';
    // At the right of the page's title, where it is always in sight (the owner: no scrolling down to publish)
    const draftField = h('label', { class: 'choice__option draft-field', for: 'song-draft', title: 'Se marca como borrador en los listados hasta que lo publiques.' }, draftBox, h('span', {}, 'Borrador'));

    const error = h('p', { class: 'error', role: 'alert' });
    const titleError = h('p', { class: 'error field-error', id: 'title-error', role: 'alert' });
    title.setAttribute('aria-describedby', 'title-error');
    // The message and the mark go as soon as the person starts to fix the title
    title.addEventListener('input', () => {
        titleError.textContent = '';
        title.removeAttribute('aria-invalid');
    });
    const keyChip = h('span', { class: 'chip', hidden: true });
    // The key of the text, with − / + to move every chord in it (the song keeps no other key than the one it is written in)
    const toneDown = h('button', { type: 'button', 'aria-label': 'Bajar el tono un semitono' }, icon('minus', 20));
    const toneUp = h('button', { type: 'button', 'aria-label': 'Subir el tono un semitono' }, icon('plus', 20));
    const toneKey = h('span', { class: 'tone-control__key', 'aria-live': 'polite' });
    const toneGroup = h('div', { class: 'tone-control__step', role: 'group', 'aria-label': 'Tono' }, toneDown, toneKey, toneUp);
    // The bar of the lyrics box (the key, "Formato", "Insertar"), flush on top of the text inside one wrapper with it
    const toolbar = createLyricsToolbar({
        tone: toneGroup,
        onCase: (mode) => applyCase(mode, said[mode]),
        onInsert: (kind) => insert(kind),
        hasSelection: () => body.selectionStart !== body.selectionEnd,
    });
    const composer = h('div', { class: 'composer' }, toolbar.element, body);
    const moveChords = (by: number): void => {
        body.value = transposeBody(capitaliseChords(body.value), by);
        // As if typed: the preview, the notice of the key, the draft and the leave guard all follow
        body.dispatchEvent(new Event('input', { bubbles: true }));
    };
    toneDown.addEventListener('click', () => moveChords(-1));
    toneUp.addEventListener('click', () => moveChords(1));
    // From 900px the lyrics and their preview sit side by side, and the sheet of chords is shown whole
    const wide = window.matchMedia('(min-width: 900px)');
    const sheet = h('div', { class: 'song-sheet song-sheet--edit' });
    // The places of the preview, as last drawn: a syllable touched puts a chord on it (`chordpro/places.ts`)
    let places = new Map<string, Piece>();
    const chordSheet = createChordSheet({
        chordAt: (id) => (places.has(id) ? places.get(id)?.chord ?? null : undefined),
        labelAt: (id) => {
            const text = places.get(id)?.text ?? '';

            return text.trim() === '' && text !== '' ? 'espacio' : text.trim();
        },
        used: () => [...new Set([...places.values()].flatMap((piece) => (piece.chord === null ? [] : [piece.chord])))],
        write: (id, chord) => {
            // Written into the text as if typed: the preview, the draft, the notice of the key and the leave guard all follow
            const next = setChordAt(capitaliseChords(body.value), id, chord);
            if (next !== null) {
                body.value = next;
                body.dispatchEvent(new Event('input', { bubbles: true }));
            }
        },
        notation: readNotation,
        wide,
        onPick: () => markPicked(),
        // The syllable touched stays clear of the sheet: what it covers is what the lyrics scroll around
        onHeight: (height) => {
            form.style.setProperty('--chord-dock-h', `${height}px`);
            if (height > 0) {
                sheet.querySelector('.is-picked')?.scrollIntoView({ block: 'nearest' });
            }
        },
    });
    const markPicked = (): void => {
        sheet.querySelector('.is-picked')?.classList.remove('is-picked');
        const id = chordSheet.picked();
        if (id !== null) {
            sheet.querySelector(`[data-place="${CSS.escape(id)}"]`)?.classList.add('is-picked');
        }
    };
    sheet.addEventListener('click', (event) => {
        const id = (event.target as Element).closest<HTMLElement>('.seg')?.dataset['place'];
        if (id !== undefined) {
            chordSheet.pick(id);
        } else if (chordSheet.picked() !== null) {
            chordSheet.close();
        }
    });
    // Capo, tempo and compás ({capo: 2}…) are shown above the lyrics, as when the song is read
    const noteChips = h('span', { class: 'preview__notes' });
    const preview = h('section', { class: 'preview', 'aria-label': 'Vista previa' }, h('h3', {}, 'Vista previa '), keyChip, noteChips, sheet);

    const draw = (): void => {
        // What is previewed is what is saved: a chord typed [c] is read as [C]
        const text = capitaliseChords(body.value);
        const parsed = parse(text);
        // The same lyrics, cut at every syllable so each can be touched; if the drawing and the pieces ever disagreed, nothing is touchable
        const drawn = editSheet(text, parsed);
        setSheet(sheet, drawn.html);
        places = new Map(markPlaces(sheet, drawn.pieces) ? drawn.pieces.map((piece) => [piece.id, piece]) : []);
        // The chords are drawn in the notation chosen in Ajustes, like everywhere else (the sheet draws them in Latin)
        const notation = readNotation();
        for (const chord of sheet.querySelectorAll<HTMLElement>('.ch[data-chord]')) {
            const name = chord.dataset['chord'] ?? '';
            chord.textContent = name === '' ? '' : transpose(name, 0, notation);
        }
        markPicked();
        chordSheet.refresh();
        const key = songKey(parsed);
        keyChip.hidden = key === null;
        keyChip.textContent = key === null ? '' : `Tono ${transpose(key, 0, readNotation())}`;
        noteChips.replaceChildren(...([['capo', 'Capo'], ['tempo', 'Tempo'], ['time', 'Compás']] as const).flatMap(([name, label]) => {
            const value = parsed.meta[name];

            return value === undefined ? [] : [h('span', { class: 'chip' }, `${label} ${value}`)];
        }));
        toneKey.textContent = key === null ? '—' : transpose(key, 0, readNotation());
        // A text with no chord has nothing to move
        toneDown.disabled = key === null;
        toneUp.disabled = key === null;
    };
    // The preview has a piece for every syllable, so a very long text costs more to draw: what is typed or pasted in one go is drawn
    // once, on the next frame. A song of ordinary length is drawn at once, as always.
    let drawing = 0;
    body.addEventListener('input', () => {
        if (body.value.length <= LONG_TEXT) {
            draw();

            return;
        }
        if (drawing === 0) {
            drawing = requestAnimationFrame(() => {
                drawing = 0;
                draw();
            });
        }
    });
    // Leaving the box writes the capitals for real (not while typing: the text under the cursor would jump)
    // Only when something changes, and keeping the selection: assigning the value puts the cursor at the end, and a format button
    // touched right after selecting lines would find nothing selected and change the whole lyrics
    body.addEventListener('change', () => {
        const capitalised = capitaliseChords(body.value);
        if (capitalised !== body.value) {
            const { selectionStart, selectionEnd } = body;
            body.value = capitalised;
            body.setSelectionRange(selectionStart, selectionEnd);
        }
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
            newSongDraft.keep({ title: title.value, author: author.value, body: body.value, listenUrl: listenUrl.value });
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
        for (const field of [title, author, body, listenUrl]) {
            field.addEventListener('input', keepSoon);
        }
        body.addEventListener('change', keepSoon);
        window.addEventListener('pagehide', keepNow);
        document.addEventListener('visibilitychange', keepWhenHidden);
        // Cancelar with something written asks first (the guard below), and only "Descartar" there drops the draft
        cancel.addEventListener('click', () => {
            if (!isDirty()) {
                dropDraft();
            }
        });
    }

    const recovered = h('div', { class: 'note-bar note-bar--draft', role: 'status', hidden: true });
    const discard = h('button', { type: 'button', class: 'note-bar__action' }, 'Descartar');
    recovered.append(h('span', {}, 'Borrador recuperado'), discard);
    const resumed = keepsDraft ? newSongDraft.load() : null;
    if (resumed !== null) {
        title.value = resumed.title;
        author.value = resumed.author;
        body.value = resumed.body;
        listenUrl.value = resumed.listenUrl ?? '';
        showListenHint();
        recovered.hidden = false;
        draw();
    }
    discard.addEventListener('click', () => {
        newSongDraft.clear();
        clearTimeout(keepTimer);
        title.value = '';
        author.value = '';
        body.value = '';
        listenUrl.value = '';
        showListenHint();
        recovered.hidden = true;
        // The form is empty again: nothing written, nothing to ask about
        baseline = snapshot();
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
    // The format of the words: the selected lines, or all of them, and "Deshacer" gives them back
    const applyCase = (mode: CaseMode, said: string): void => {
        const before = body.value;
        const from = body.selectionStart;
        const to = body.selectionEnd;
        const selected = from !== to;
        const result = changeCaseInRange(before, selected ? from : 0, selected ? to : before.length, mode);
        if (result.text === before) {
            return;
        }
        body.value = result.text;
        if (selected) {
            body.setSelectionRange(result.from, result.to);
        } else {
            body.setSelectionRange(from, to);
        }
        convertedText.textContent = `${said}${selected ? ' en las líneas seleccionadas' : ''}`;
        converted.hidden = false;
        revert = () => {
            body.value = before;
            body.setSelectionRange(from, to);
        };
        draw();
        keepSoon();
    };
    const said: Readonly<Record<CaseMode, string>> = { lower: 'Letra en minúsculas', upper: 'Letra en MAYÚSCULAS', sentence: 'Letra en tipo oración' };
    /** "Insertar": at the cursor or around the selection (`chordpro/insert.ts`), as if typed: the preview, the draft and the leave guard follow */
    const insert = (kind: InsertKind): void => {
        const result = insertItem(body.value, body.selectionStart, body.selectionEnd, kind);
        body.value = result.text;
        body.focus();
        body.setSelectionRange(result.from, result.to);
        body.dispatchEvent(new Event('input', { bubbles: true }));
    };
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
    writeTab.addEventListener('click', () => {
        chordSheet.dismiss();
        showPane('write');
    });
    seeTab.addEventListener('click', () => showPane('see'));

    writePane.append(
        h('label', { for: 'body' }, 'Letra con acordes'),
        composer,
        converted,
        tagField.element,
        h(
            'details',
            { class: 'help' },
            h('summary', {}, 'Cómo escribir los acordes'),
            h('p', {}, 'Los acordes van entre corchetes, justo antes de la sílaba donde cambian. Puedes escribirlos en cifrado americano (C, Am, F#m7) o en español (Do, Lam, Fa#m7).'),
            h('pre', {}, HELP),
            h('p', {}, '{c: Coro} abre una sección con nombre; {soc} … {eoc} es un coro; {ci: x2} es una indicación: una nota en cursiva dentro de la estrofa, sin etiqueta ni número (por ejemplo {ci: Intro} antes de una línea de acordes); el botón «Indicación» la inserta. Las líneas que empiezan con # no se muestran.'),
            h('p', {}, 'Sin escribir corchetes: en la vista previa (la pestaña «Ver» en el teléfono) toca una sílaba y arma el acorde con la hoja que se abre; toca de nuevo lo marcado para quitarlo.'),
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
        h('div', { class: 'listen-field' }, h('label', { for: 'listen-url' }, 'Enlace para escuchar'), listenUrl, listenHint),
        switcher,
        panes,
        error,
        chordSheet.element,
        foot,
    );
    // The sheet of chords rests on the foot (Guardar, Cancelar): it needs to know how tall that is
    const footObserver = new ResizeObserver(() => form.style.setProperty('--edit-foot-h', `${foot.offsetHeight}px`));
    footObserver.observe(foot);
    const closeOnEscape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && chordSheet.picked() !== null) {
            chordSheet.close();
        }
    };
    document.addEventListener('keydown', closeOnEscape);

    // From 900px "Eliminar" rides in the foot, level with Guardar and Cancelar (on a phone it stays under the
    // lyrics, away from Guardar). It is the same button: only where it sits changes. A new song has none.
    const removeButton = writePane.querySelector<HTMLElement>('.edit-remove');
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

    /** The title is missing: said at the field, which gets the focus (with the keyboard open the buttons are out of sight) */
    const askForTitle = (): void => {
        titleError.textContent = 'El canto necesita un título.';
        title.setAttribute('aria-invalid', 'true');
        title.focus();
    };
    /** Writes what is in the form to the song (chords capitalised, as previewed); the caller says what comes next */
    const commit = (): Promise<Song> => {
        body.value = capitaliseChords(body.value);
        const draft: SongDraft = {
            title: title.value, author: author.value, body: body.value, tags: tagField.value(), status: draftBox.checked ? 'draft' : 'published',
            listenUrl: listenUrl.value,
        };

        return existing === undefined ? app.create(draft) : saveEdit(app, existing, draft);
    };
    const failureText = (failure: unknown): string => (failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.');
    /** Allowed (a title first, the lyrics later), but not in silence */
    const warnIfEmpty = (song: Song): void => {
        if (song.body.trim() === '') {
            showToast(`“${song.title}” se guardó sin letra todavía.`, 4000, true);
        }
    };
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        if (title.value.trim() === '') {
            askForTitle();

            return;
        }
        save.disabled = true;
        commit()
            .then((song) => {
                saved = true;
                dropDraft();
                warnIfEmpty(song);
                if (existing === undefined && start.into !== undefined) {
                    return placeInPart(app, navigate, song, start.into);
                }

                // Back to the song being sung, replacing this screen so "back" does not return to the form
                return start.back !== undefined ? navigate(start.back, { replace: true }) : navigate(paths.view(song.id));
            })
            .catch((failure: unknown) => {
                error.textContent = failureText(failure);
                save.disabled = false;
            });
    });

    // ----- leaving with something not saved: the person is asked (the back button, the menu, a link, Cancelar) -----
    // The draft is for the app closing or hanging; the question is for leaving by mistake: a new song has both
    const snapshot = (): string => JSON.stringify([title.value, author.value, body.value, tagField.value(), draftBox.checked, listenUrl.value]);
    baseline = snapshot();
    const isDirty = (): boolean => !saved && snapshot() !== baseline;
    setLeaveGuard({
        isDirty,
        ask: async () => {
            const answer = await chooseDialog({
                title: '¿Salir sin guardar?',
                text: existing === undefined ? 'Escribiste este canto y no lo has guardado.' : 'Cambiaste este canto y no lo has guardado.',
                cancel: 'Seguir editando',
                choices: [
                    { label: 'Descartar', value: 'discard' as const, kind: 'danger' },
                    { label: 'Guardar', value: 'save' as const, kind: 'primary' },
                ],
            });
            if (answer === 'discard') {
                dropDraft();

                return true;
            }
            if (answer !== 'save') {
                return false;
            }
            if (title.value.trim() === '') {
                // Cannot be saved without one: the person stays, with the field asking for it
                askForTitle();

                return false;
            }
            save.disabled = true;
            try {
                const song = await commit();
                saved = true;
                dropDraft();
                warnIfEmpty(song);
                if (existing === undefined && start.into !== undefined) {
                    // The song goes to the section it was written for, and the person goes where they were heading
                    await app.setlists.addItem(start.into.setlist, start.into.part, song.id).catch(() => showToast(`“${song.title}” se guardó, pero no se agregó al listado.`, 6000, true));
                }

                return true;
            } catch (failure) {
                error.textContent = failureText(failure);
                save.disabled = false;

                return false;
            }
        },
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

    const element = h('div', { class: 'page page--edit' }, h('div', { class: 'edit-head' }, h('h2', {}, existing === undefined ? 'Nuevo canto' : 'Editar canto'), draftField), recovered, notices, form);
    // With the title already typed (from the search, or a draft), the lyrics are what is missing
    queueMicrotask(() => (existing === undefined && title.value === '' ? title : body).focus());

    return {
        element,
        dispose: () => {
            cancelAnimationFrame(drawing);
            toolbar.dispose();
            setLeaveGuard(null);
            chordSheet.dispose();
            footObserver.disconnect();
            document.removeEventListener('keydown', closeOnEscape);
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
