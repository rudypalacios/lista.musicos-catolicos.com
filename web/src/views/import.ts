import type { App } from '../app.ts';
import { capitaliseChords } from '../chordpro/capitalise.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import { h, link, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { alreadyHave, bytesLabel, footOf, pagesLabel, readingLabel, readingPercent, repeatedInBatch, sizeLabel, suggestedTitle } from '../import-review.ts';
import { attentionOf, importMany, type Imported } from '../importer.ts';
import { sameTag, tagsInUse } from '../data/tags.ts';
import { MASS_PARTS, massTag } from '../mass.ts';
import { createTagField, type TagField } from './tag-field.ts';
import { paths } from '../router.ts';
import type { Navigate, View } from './types.ts';

/** One song found in the pasted text: a row of the review, with the fields the person can still change */
interface Card {
    element: HTMLElement;
    include: HTMLInputElement;
    title: HTMLInputElement;
    author: HTMLInputElement;
    body: HTMLTextAreaElement;
    /** What the song is for: the part the header named, until the person changes it */
    tags: TagField;
    error: HTMLElement;
    /** Opens the row (to show where a problem is) */
    open: () => void;
}

/**
 * Bringing in songs written with the chords above the words: paste the text (or choose a PDF; one song, or a
 * whole Mass with one song per page), check what came out, fix it, save. The check is not optional politeness:
 * a chord's column depends on the spaces the paste kept, so it is often a letter or two off.
 *
 * The review is one row per song with only what asks for a look flagged (no title, no chords, two columns, a
 * song the person already has); a touch opens the row to correct it. Guardar rests at the foot, and is blocked
 * while a song to be saved has no title.
 */
export function importView(app: App, navigate: Navigate): View {
    const paste = h('textarea', {
        id: 'paste', class: 'mono', spellcheck: 'false', autocapitalize: 'off', wrap: 'off',
        placeholder: 'ENTRADA: Caminamos con alegría\n\nC            Am\n1.  Un pueblo que espera el mañana,\n',
    });
    const convert = h('button', { type: 'button', class: 'button' }, 'Convertir');
    const pasteError = h('p', { class: 'error', role: 'alert' });
    // The device's own file button reads differently on each one (and in the browser's language): the app draws its own
    // (outside the rows that rest while a PDF is read, so "Cambiar PDF" can open it too)
    const pdf = h('input', { id: 'pdf-file', class: 'sr-only', type: 'file', accept: 'application/pdf,.pdf' });
    const pick = h(
        'label',
        { class: 'pick', for: 'pdf-file' },
        h('span', { class: 'pick__badge' }, icon('upload', 24)),
        h('span', { class: 'pick__text' },
            h('strong', {}, 'Elegir PDF'),
            h('small', {}, h('span', { class: 'pick__drop' }, 'o suéltalo aquí · '), 'Se lee en tu dispositivo: no se envía a ningún servidor.')),
    );

    // The file once chosen: its name, its size, and a bar that fills page by page
    const fileName = h('b', {});
    const fileInfo = h('small', {});
    const fileBadge = h('span', { class: 'file-card__badge' }, icon('file', 22));
    const fileChange = h('button', { type: 'button', class: 'link-button', hidden: true }, 'Cambiar PDF');
    const bar = h('i', {});
    const track = h('div', { class: 'file-card__track', role: 'progressbar', 'aria-label': 'Leyendo el PDF', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar);
    const say = h('p', { class: 'file-card__say', role: 'status' });
    const fileCard = h(
        'div',
        { class: 'file-card', hidden: true },
        h('div', { class: 'file-card__top' }, fileBadge, h('span', { class: 'file-card__name' }, fileName, fileInfo)),
        track,
        h('div', { class: 'file-card__foot' }, say, fileChange),
    );
    // While a PDF is being read or has been read, the ways to give text rest out of the way
    const inputs = h('div', { class: 'import-inputs' });

    const showReading = (file: File, read: number, total: number): void => {
        fileName.textContent = file.name;
        fileInfo.textContent = total > 0 ? `${pagesLabel(total)} · ${bytesLabel(file.size)}` : bytesLabel(file.size);
        const percent = readingPercent(read, total);
        bar.style.width = `${percent}%`;
        track.setAttribute('aria-valuenow', String(percent));
        say.textContent = readingLabel(read, total);
    };
    const showRead = (file: File, total: number, found: number): void => {
        fileCard.classList.add('is-done');
        fileInfo.textContent = `${pagesLabel(total)} · ${bytesLabel(file.size)} · Listo`;
        fileChange.hidden = false;
        track.hidden = true;
        say.textContent = found === 1 ? '1 canto encontrado' : `${found} cantos encontrados`;
    };

    let reading = false;
    /** A PDF is read where the chords really are (their position on the page), which a paste cannot say */
    const readFile = (file: File): void => {
        if (reading) {
            return;
        }
        reading = true;
        pasteError.textContent = '';
        let total = 0;
        fileCard.classList.remove('is-done');
        fileChange.hidden = true;
        track.hidden = false;
        fileCard.hidden = false;
        inputs.hidden = true;
        showReading(file, 0, 0);
        void import('../pdf/read.ts')
            .then((reader) => reader.readPdf(file, (read, pages) => {
                total = pages;
                showReading(file, read, pages);
            }))
            .then(async (text) => {
                const found = await convertNow(text, false);
                if (found > 0) {
                    showRead(file, total, found);
                }
            })
            .catch((failure: unknown) => {
                fileCard.hidden = true;
                inputs.hidden = false;
                pasteError.textContent = failure instanceof Error && failure.name === 'PdfError'
                    ? failure.message
                    : 'No se pudo cargar el lector de PDF. Leer un PDF necesita conexión; pegar el texto funciona sin ella.';
            })
            .finally(() => {
                pdf.value = '';
                reading = false;
            });
    };
    pdf.addEventListener('change', () => {
        const file = pdf.files?.[0];
        if (file !== undefined) {
            readFile(file);
        }
    });
    fileChange.addEventListener('click', () => pdf.click());
    pdf.addEventListener('focus', () => pick.classList.add('is-focus'));
    pdf.addEventListener('blur', () => pick.classList.remove('is-focus'));
    // On a computer the file can also be dropped on the card
    pick.addEventListener('dragover', (event) => {
        event.preventDefault();
        pick.classList.add('is-over');
    });
    pick.addEventListener('dragleave', () => pick.classList.remove('is-over'));
    pick.addEventListener('drop', (event) => {
        event.preventDefault();
        pick.classList.remove('is-over');
        const file = event.dataTransfer?.files[0];
        if (file !== undefined) {
            readFile(file);
        }
    });

    const heading = h('h2', {}, 'Revisa el resultado');
    const hint = h('p', { class: 'help' }, 'Revisa los que tienen aviso.');
    const cards = h('div', { class: 'cards' });
    const saveError = h('p', { class: 'error', role: 'alert' });
    const footMessage = h('p', { class: 'import-foot__msg', role: 'status' });
    const save = h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar');
    const review = h(
        'form',
        { class: 'form', hidden: true, novalidate: true },
        heading,
        hint,
        cards,
        saveError,
        h('div', { class: 'actions edit-foot import-foot' }, footMessage, save, link(paths.list(), 'Cancelar', 'button')),
    );

    let current: Card[] = [];

    /** What the foot says and lets the person do, from the rows as they are now */
    const refreshFoot = (): void => {
        const foot = footOf(current.map((card) => ({ included: card.include.checked, title: card.title.value })));
        footMessage.textContent = foot.message;
        footMessage.hidden = foot.message === '';
        save.disabled = !foot.canSave;
        save.textContent = foot.saving <= 1 ? 'Guardar canto' : `Guardar ${foot.saving} cantos`;
    };

    /**
     * Turns text into the rows of the review; returns how many songs it found.
     * `fromPaste`: the text is the box's (a PDF's text is not put in the box: it has page breaks and nothing to edit)
     */
    async function convertNow(text: string = paste.value, fromPaste = true): Promise<number> {
        const imported = importMany(text).filter((song) => song.body !== '');
        if (imported.length === 0) {
            pasteError.textContent = fromPaste ? 'Pega primero el canto.' : 'No se encontró ningún canto en este PDF.';
            review.hidden = true;

            return 0;
        }
        if (fromPaste) {
            fileCard.hidden = true;
            inputs.hidden = false;
        }
        pasteError.textContent = '';
        saveError.textContent = '';
        // A song the person already has (the same title and the same text) starts unmarked
        const saved = await app.list();
        // The tags offered in each row: the ones in use, then the Mass's
        const inUse = tagsInUse(saved);
        const offered = [...inUse, ...MASS_PARTS.map((part) => part.tag).filter((tag) => !inUse.some((used) => sameTag(used, tag)))];
        // The same song twice in one file (a repeated page) is offered once: the second starts unmarked
        const repeats = repeatedInBatch(imported);
        current = imported.map((song, index) => card(song, index, imported.length, alreadyHave(song, saved), repeats[index] === true, offered, refreshFoot));
        cards.replaceChildren(...current.map((c) => c.element));
        heading.textContent = imported.length === 1 ? 'Revisa el resultado' : `Se encontraron ${imported.length} cantos`;
        hint.hidden = imported.length === 1;
        review.hidden = false;
        refreshFoot();
        if (fromPaste) {
            review.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        return imported.length;
    }

    convert.addEventListener('click', () => void convertNow());
    // Pasting is asking for the conversion: the text is in the box once the paste has finished
    paste.addEventListener('paste', () => setTimeout(() => void convertNow(), 0));

    review.addEventListener('submit', (event) => {
        event.preventDefault();
        saveError.textContent = '';
        save.disabled = true;
        void saveAll(app, current)
            .then((saved) => {
                const only = saved.length === 1 ? saved[0] : undefined;
                navigate(only !== undefined ? paths.view(only) : paths.list());
            })
            .catch((failure: unknown) => {
                saveError.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar.';
                refreshFoot();
            });
    });

    inputs.append(
        pick,
        h('p', { class: 'or' }, 'o'),
        h('label', { for: 'paste' }, 'Pegar el texto con los acordes'),
        paste,
        h('div', { class: 'actions' }, convert),
    );

    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Importar cantos'),
        h('p', {}, 'Sube un PDF o pega el texto con los acordes sobre la letra. Si trae varios cantos, se separan solos; los revisas antes de guardar.'),
        pdf,
        fileCard,
        inputs,
        pasteError,
        review,
    );

    return { element };
}

/** Saves the checked cards in order; a card with a problem is opened and nothing after it is lost */
async function saveAll(app: App, cards: Card[]): Promise<string[]> {
    const saved: string[] = [];
    for (const card of cards) {
        card.error.textContent = '';
        if (!card.include.checked) {
            continue;
        }
        try {
            // What the card previewed is what is saved: a chord corrected by hand as [am] is read as [Am]
            const song = await app.create({
                title: card.title.value,
                author: card.author.value,
                body: capitaliseChords(card.body.value),
                tags: card.tags.value(),
            });
            saved.push(song.id);
            // Saved: it must not be saved again if a later one fails and the person tries again
            card.include.checked = false;
            card.include.disabled = true;
        } catch (failure) {
            card.error.textContent = failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.';
            card.open();
            throw new Error(`Hay un problema en “${card.title.value || 'un canto sin título'}”. Corrígelo y vuelve a guardar.`);
        }
    }
    if (saved.length === 0) {
        throw new Error('No hay ningún canto marcado para guardar.');
    }

    return saved;
}

/**
 * A row. `total`: how many songs the paste held (one song opens at once and has no mark to choose).
 * `have`: the person already has it. `repeated`: an earlier song of this same import is this one. `offered`: the tags a row
 * can offer to touch. `changed`: called when something the foot depends on changes.
 */
function card(song: Imported, index: number, total: number, have: boolean, repeated: boolean, offered: readonly string[], changed: () => void): Card {
    const id = `card-${index}`;
    const include = h('input', { type: 'checkbox', id: `${id}-include`, checked: !have && !repeated, 'aria-label': 'Importar este canto' });
    const title = h('input', { id: `${id}-title`, type: 'text', autocomplete: 'off' });
    const author = h('input', { id: `${id}-author`, type: 'text', autocomplete: 'off' });
    const body = h('textarea', { id: `${id}-body`, class: 'mono', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Letra con acordes (ChordPro)' });
    title.value = song.title;
    author.value = song.author;
    body.value = song.body;
    const error = h('p', { class: 'error', role: 'alert' });

    const part = MASS_PARTS.find((p) => p.id === song.part);
    // The part the header named ("ENTRADA: …") is the song's tag; it can be changed or taken off in the open row
    const tags = createTagField({
        id: `${id}-tags`,
        initial: part === undefined ? [] : [massTag(part.id) ?? part.name],
        suggestions: () => offered,
        onChange: () => showTags(),
    });
    const notes = h('ul', { class: 'notes' }, ...song.warnings.map((warning) => h('li', {}, warning)));
    const sheet = h('div', { class: 'song-sheet' });
    const draw = (): void => setSheet(sheet, sheetHtml(parse(capitaliseChords(body.value))));

    // ----- the head: the mark, the name (or the field, while the song has no title) and the arrow -----
    const nameText = h('span', { class: 'import-card__title' });
    const meta = h('span', { class: 'import-card__meta' });
    const skipped = [...(have ? ['Ya la tienes'] : []), ...(repeated ? ['Repetido'] : [])];
    const pills = [...attentionOf(song.warnings), ...skipped];
    const pillRow = h('span', {}, ...pills.map((label) => h('span', { class: skipped.includes(label) ? 'pill pill--have' : 'pill pill--warn' }, label)));
    // What the song will be tagged with, said in the row: the part the header named, or that it has none
    const tagPill = h('span', { class: 'pill' });
    const showTags = (): void => {
        const now = tags.value();
        tagPill.textContent = now.length === 0 ? 'Sin etiqueta' : `Etiqueta: ${now.join(', ')}`;
        tagPill.classList.toggle('pill--none', now.length === 0);
    };
    pillRow.append(tagPill);
    showTags();
    const nameButton = h('button', { type: 'button', class: 'import-card__name', 'aria-expanded': 'false', 'aria-controls': `${id}-open` }, nameText, pillRow, meta);
    const arrow = h('button', { type: 'button', class: 'import-card__arrow', 'aria-label': 'Ver y corregir este canto', 'aria-expanded': 'false', 'aria-controls': `${id}-open` }, icon('chevron-down', 20));

    // A song that came with no title shows its field right in the row, with what to do about it
    const untitled = song.title.trim() === '';
    const suggestion = untitled ? suggestedTitle(song.body) : null;
    const required = h('p', { class: 'import-card__required', hidden: true }, 'Título requerido');
    const use = suggestion === null
        ? null
        : h('button', { type: 'button', class: 'import-card__use' }, h('span', {}, `Usar «${suggestion}»`));
    const fix = h('div', { class: 'import-card__fix', hidden: true }, required, ...(use === null ? [] : [use]));
    if (untitled) {
        title.setAttribute('aria-label', 'Título');
        title.setAttribute('placeholder', 'Título');
    }

    const checkbox = total > 1 ? h('label', { class: 'import-card__check' }, include) : h('span', { hidden: true }, include);
    const head = h('div', { class: 'import-card__head' }, checkbox, untitled ? title : nameButton, arrow);

    // ----- the open part: where the song is corrected. The preview shows first (it is what the person checks); the text is one tab away -----
    const preview = h('section', { class: 'preview' }, sheet);
    const tabVista = h('button', { type: 'button', role: 'tab', id: `${id}-tab-vista`, 'aria-controls': `${id}-pane-vista`, 'aria-selected': 'true' }, 'Vista previa');
    const tabLetra = h('button', { type: 'button', role: 'tab', id: `${id}-tab-letra`, 'aria-controls': `${id}-pane-letra`, 'aria-selected': 'false' }, 'Letra con acordes');
    const tabs = h('div', { class: 'import-tabs', role: 'tablist', 'aria-label': 'Letra con acordes o vista previa' }, tabLetra, tabVista);

    const open = h('div', { class: 'import-card__open', id: `${id}-open`, hidden: true },
        part !== undefined ? h('p', { class: 'help' }, `Parte de la misa que dice el encabezado: ${part.name}.`) : h('span', {}),
        notes,
        ...(untitled ? [] : [h('label', { for: `${id}-title` }, 'Título'), title]),
        h('label', { for: `${id}-author` }, 'Autor (opcional)'),
        author,
        tabs,
        h('div', { class: 'import-pane', id: `${id}-pane-vista`, role: 'tabpanel', 'aria-labelledby': `${id}-tab-vista` }, preview),
        h('div', { class: 'import-pane', id: `${id}-pane-letra`, role: 'tabpanel', 'aria-labelledby': `${id}-tab-letra`, hidden: true }, body),
        tags.element,
    );

    const element = h('section', { class: 'import-card' }, head, fix, open, error);

    const paneVista = open.querySelector<HTMLElement>(`#${id}-pane-vista`);
    const paneLetra = open.querySelector<HTMLElement>(`#${id}-pane-letra`);
    const showTab = (tab: 'vista' | 'letra'): void => {
        if (paneVista === null || paneLetra === null) {
            return;
        }
        paneVista.hidden = tab !== 'vista';
        paneLetra.hidden = tab !== 'letra';
        tabVista.setAttribute('aria-selected', String(tab === 'vista'));
        tabLetra.setAttribute('aria-selected', String(tab === 'letra'));
        if (tab === 'vista') {
            // Drawn when it is looked at, so what was typed in the other tab is what shows
            draw();
        }
    };
    tabVista.addEventListener('click', () => showTab('vista'));
    tabLetra.addEventListener('click', () => showTab('letra'));

    let drawn = false;
    const setOpen = (value: boolean): void => {
        open.hidden = !value;
        nameButton.setAttribute('aria-expanded', String(value));
        arrow.setAttribute('aria-expanded', String(value));
        element.classList.toggle('is-open', value);
        if (value && !drawn) {
            // The preview is made when the row is first opened: a Mass of twelve songs does not draw twelve at once
            draw();
            drawn = true;
        }
    };
    const toggle = (): void => setOpen(open.hidden);
    nameButton.addEventListener('click', toggle);
    arrow.addEventListener('click', toggle);

    const refresh = (): void => {
        nameText.textContent = title.value.trim();
        meta.textContent = sizeLabel(body.value);
        const missing = include.checked && title.value.trim() === '';
        element.classList.toggle('is-missing', missing);
        element.classList.toggle('is-off', !include.checked);
        required.hidden = !missing;
        fix.hidden = !missing;
        if (title.value.trim() === '') {
            title.setAttribute('aria-invalid', String(missing));
        } else {
            title.removeAttribute('aria-invalid');
        }
        changed();
    };
    title.addEventListener('input', refresh);
    include.addEventListener('change', refresh);
    body.addEventListener('input', () => {
        meta.textContent = sizeLabel(body.value);
    });
    use?.addEventListener('click', () => {
        title.value = suggestion ?? '';
        refresh();
    });

    refresh();
    // One song is the whole screen: it opens at once
    setOpen(total === 1);

    return { element, include, title, author, body, tags, error, open: () => setOpen(true) };
}
