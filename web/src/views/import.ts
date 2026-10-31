import type { App } from '../app.ts';
import { capitaliseChords } from '../chordpro/capitalise.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import { h, link, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { alreadyHave, footOf, sizeLabel, suggestedTitle } from '../import-review.ts';
import { attentionOf, importMany, type Imported } from '../importer.ts';
import { MASS_PARTS } from '../mass.ts';
import { paths } from '../router.ts';
import type { Navigate, View } from './types.ts';

/** One song found in the pasted text: a row of the review, with the fields the person can still change */
interface Card {
    element: HTMLElement;
    include: HTMLInputElement;
    title: HTMLInputElement;
    author: HTMLInputElement;
    body: HTMLTextAreaElement;
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
    const convert = h('button', { type: 'button', class: 'button button--primary' }, 'Convertir');
    const pasteError = h('p', { class: 'error', role: 'alert' });
    // The device's own file button reads differently on each one (and in the browser's language): the app draws its own
    const pdf = h('input', { class: 'sr-only', type: 'file', accept: 'application/pdf,.pdf' });
    const pdfStatus = h('p', { class: 'help', role: 'status' });

    // A PDF is read where the chords really are (their position on the page), which a paste cannot say
    pdf.addEventListener('change', () => {
        const file = pdf.files?.[0];
        if (file === undefined) {
            return;
        }
        pasteError.textContent = '';
        pdfStatus.textContent = 'Leyendo el PDF…';
        void import('../pdf/read.ts')
            .then((reader) => reader.readPdf(file))
            .then((text) => {
                paste.value = text;
                pdfStatus.textContent = `Leído: ${file.name}`;
                return convertNow();
            })
            .catch((failure: unknown) => {
                pdfStatus.textContent = '';
                pasteError.textContent = failure instanceof Error && failure.name === 'PdfError'
                    ? failure.message
                    : 'No se pudo cargar el lector de PDF. Se necesita conexión para leer un PDF.';
            })
            .finally(() => {
                pdf.value = '';
            });
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

    async function convertNow(): Promise<void> {
        const imported = importMany(paste.value).filter((song) => song.body !== '');
        if (imported.length === 0) {
            pasteError.textContent = 'Pega primero el canto.';
            review.hidden = true;
            return;
        }
        pasteError.textContent = '';
        saveError.textContent = '';
        // A song the person already has (the same title and the same text) starts unmarked
        const saved = await app.list();
        current = imported.map((song, index) => card(song, index, imported.length, alreadyHave(song, saved), refreshFoot));
        cards.replaceChildren(...current.map((c) => c.element));
        heading.textContent = imported.length === 1 ? 'Revisa el resultado' : `Se encontraron ${imported.length} cantos`;
        hint.hidden = imported.length === 1;
        review.hidden = false;
        refreshFoot();
        review.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Importar cantos'),
        h('p', {}, 'Sube un PDF o pega el texto con los acordes sobre la letra. Si trae varios cantos, se separan solos; los revisas antes de guardar.'),
        h('label', { class: 'button file-pick' }, 'Elegir PDF', pdf),
        h('p', { class: 'help' }, 'El PDF se lee en tu dispositivo: no se envía a ningún servidor.'),
        pdfStatus,
        h('label', { for: 'paste' }, 'O pegar el texto'),
        paste,
        pasteError,
        h('div', { class: 'actions' }, convert),
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
            const song = await app.create({ title: card.title.value, author: card.author.value, body: capitaliseChords(card.body.value) });
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
 * `have`: the person already has it. `changed`: called when something the foot depends on changes.
 */
function card(song: Imported, index: number, total: number, have: boolean, changed: () => void): Card {
    const id = `card-${index}`;
    const include = h('input', { type: 'checkbox', id: `${id}-include`, checked: !have, 'aria-label': 'Importar este canto' });
    const title = h('input', { id: `${id}-title`, type: 'text', autocomplete: 'off' });
    const author = h('input', { id: `${id}-author`, type: 'text', autocomplete: 'off' });
    const body = h('textarea', { id: `${id}-body`, class: 'mono', spellcheck: 'false', autocapitalize: 'off' });
    title.value = song.title;
    author.value = song.author;
    body.value = song.body;
    const error = h('p', { class: 'error', role: 'alert' });

    const part = MASS_PARTS.find((p) => p.id === song.part);
    const notes = h('ul', { class: 'notes' }, ...song.warnings.map((warning) => h('li', {}, warning)));
    const sheet = h('div', { class: 'song-sheet' });
    const draw = (): void => setSheet(sheet, sheetHtml(parse(capitaliseChords(body.value))));

    // ----- the head: the mark, the name (or the field, while the song has no title) and the arrow -----
    const nameText = h('span', { class: 'import-card__title' });
    const meta = h('span', { class: 'import-card__meta' });
    const pills = [...attentionOf(song.warnings), ...(have ? ['Ya la tienes'] : [])];
    const pillRow = h('span', {}, ...pills.map((label) => h('span', { class: label === 'Ya la tienes' ? 'pill pill--have' : 'pill pill--warn' }, label)));
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

    // ----- the open part: where the song is corrected -----
    const open = h('div', { class: 'import-card__open', id: `${id}-open`, hidden: true },
        part !== undefined ? h('p', { class: 'help' }, `Parte de la misa que dice el encabezado: ${part.name}.`) : h('span', {}),
        notes,
        ...(untitled ? [] : [h('label', { for: `${id}-title` }, 'Título'), title]),
        h('label', { for: `${id}-author` }, 'Autor (opcional)'),
        author,
        h('label', { for: `${id}-body` }, 'Letra con acordes (ChordPro)'),
        body,
        h('section', { class: 'preview', 'aria-label': 'Vista previa' }, h('h3', {}, 'Vista previa'), sheet),
    );

    const element = h('section', { class: 'import-card' }, head, fix, open, error);

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
        if (drawn) {
            draw();
        }
    });
    use?.addEventListener('click', () => {
        title.value = suggestion ?? '';
        refresh();
    });

    refresh();
    // One song is the whole screen: it opens at once
    setOpen(total === 1);

    return { element, include, title, author, body, error, open: () => setOpen(true) };
}
