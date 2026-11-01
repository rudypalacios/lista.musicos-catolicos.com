import type { App } from '../app.ts';
import { capitaliseChords } from '../chordpro/capitalise.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import { h, link, setSheet } from '../dom.ts';
import { icon } from '../icons.ts';
import { bytesLabel, firstOfBatch, footOf, heldSong, pagesLabel, readingLabel, readingPercent, sizeLabel, suggestedTitle } from '../import-review.ts';
import { armedMessage, entriesOf, planPlacements, type ImportRow } from '../import-list.ts';
import { defaultTitle } from '../data/setlists.ts';
import { today } from '../dates.ts';
import { rememberTemplate } from '../last-template.ts';
import { showToast, showUndoToast } from '../toast.ts';
import { attentionOf, importMany, type Imported } from '../importer.ts';
import type { OcrProgress } from '../ocr/read.ts';
import { sameTag, tagsInUse } from '../data/tags.ts';
import { MASS_PARTS, massTag } from '../mass.ts';
import { createTagField, type TagField } from './tag-field.ts';
import { createTemplatePickSheet, type TemplatePick } from './template-choices.ts';
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
    /** The id of the song it was saved as, once it is */
    savedId: string | null;
    /** The id of the song the person already has that this is ("Ya la tienes"), or null */
    heldId: string | null;
    /** The place of the first identical row of the import (its own place when it is the first) */
    sameAs: number;
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
    // A photo of a sheet: the camera (a phone or a tablet; a computer has none to open, so its card is hidden there) or a picture
    // from the gallery. Both are read on the device like the PDF (web/src/ocr/): nothing is sent anywhere.
    const photo = h('input', { id: 'photo-file', class: 'sr-only', type: 'file', accept: 'image/*', capture: 'environment' });
    const gallery = h('input', { id: 'image-file', class: 'sr-only', type: 'file', accept: 'image/*' });
    const shoot = h(
        'label',
        { class: 'pick pick--camera', for: 'photo-file' },
        h('span', { class: 'pick__badge' }, icon('camera', 24)),
        h('span', { class: 'pick__text' },
            h('strong', {}, 'Tomar fotografía'),
            h('small', {}, 'Se lee en tu dispositivo: la foto no se envía a ningún servidor.')),
    );
    const pickImage = h(
        'label',
        { class: 'pick', for: 'image-file' },
        h('span', { class: 'pick__badge' }, icon('image', 24)),
        h('span', { class: 'pick__text' },
            h('strong', {}, 'Cargar imagen'),
            h('small', {}, h('span', { class: 'pick__drop' }, 'o suéltala aquí · '), 'Una foto o captura. Se lee en tu dispositivo.')),
    );
    const tip = h(
        'p',
        { class: 'import-tip' },
        icon('info', 18),
        h('span', {}, h('b', {}, 'Mejor con acordes impresos'), ', la hoja derecha y buena luz. Los acordes escritos a mano también se intentan leer, pero sin garantía de calidad: revísalos.'),
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
        fileInfo.textContent = total > 0 ? `${pagesLabel(total)} · ${bytesLabel(file.size)} · Listo` : `${bytesLabel(file.size)} · Listo`;
        fileChange.hidden = false;
        track.hidden = true;
        say.textContent = found === 1 ? '1 canto encontrado' : `${found} cantos encontrados`;
    };
    /** A photo has no pages: the bar fills stage by stage and the sentence says which */
    const showImageReading = (file: File, progress: OcrProgress): void => {
        fileName.textContent = file.name;
        fileInfo.textContent = bytesLabel(file.size);
        bar.style.width = `${progress.percent}%`;
        track.setAttribute('aria-valuenow', String(progress.percent));
        say.textContent = progress.label;
    };

    let reading = false;
    /** What "Cambiar …" opens: the picker of the kind of file that was read last */
    let changeInput: HTMLInputElement = pdf;
    /**
     * A PDF is read where the chords really are (their position on the page), which a paste cannot say. A photo is read by a
     * character reader on the device (web/src/ocr/): the same, from the position of every word in the picture.
     */
    const readFile = (file: File, origin: 'pdf' | 'image'): void => {
        if (reading) {
            return;
        }
        reading = true;
        pasteError.textContent = '';
        let total = 0;
        fileCard.classList.remove('is-done');
        fileChange.hidden = true;
        fileChange.textContent = origin === 'pdf' ? 'Cambiar PDF' : 'Cambiar imagen';
        changeInput = origin === 'pdf' ? pdf : gallery;
        fileBadge.replaceChildren(icon(origin === 'pdf' ? 'file' : 'image', 22));
        track.hidden = false;
        track.setAttribute('aria-label', origin === 'pdf' ? 'Leyendo el PDF' : 'Leyendo la imagen');
        fileCard.hidden = false;
        inputs.hidden = true;
        let text: Promise<string>;
        if (origin === 'pdf') {
            showReading(file, 0, 0);
            text = import('../pdf/read.ts').then((module) => module.readPdf(file, (read, pages) => {
                total = pages;
                showReading(file, read, pages);
            }));
        } else {
            showImageReading(file, { percent: 0, label: 'Preparando la imagen…' });
            text = import('../ocr/read.ts').then((module) => module.readImage(file, (progress) => showImageReading(file, progress)));
        }
        void text
            .then(async (read) => {
                const found = await convertNow(read, origin);
                if (found > 0) {
                    showRead(file, total, found);
                } else {
                    // Nothing came out: the way to try again is the cards, so they come back
                    fileCard.hidden = true;
                    inputs.hidden = false;
                }
            })
            .catch((failure: unknown) => {
                fileCard.hidden = true;
                inputs.hidden = false;
                const known = failure instanceof Error && (failure.name === 'PdfError' || failure.name === 'OcrError');
                pasteError.textContent = known
                    ? failure.message
                    : origin === 'pdf'
                        ? 'No se pudo cargar el lector de PDF. Leer un PDF necesita conexión; pegar el texto funciona sin ella.'
                        : 'No se pudo cargar el lector de imágenes. Leer una imagen necesita conexión la primera vez; pegar el texto funciona sin ella.';
            })
            .finally(() => {
                pdf.value = '';
                photo.value = '';
                gallery.value = '';
                reading = false;
            });
    };
    /** A file dropped on a card is read for what it is, whichever card it fell on */
    const kindOf = (file: File): 'pdf' | 'image' => (file.type.startsWith('image/') ? 'image' : 'pdf');
    for (const [input, card] of [[pdf, pick], [photo, shoot], [gallery, pickImage]] as const) {
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file !== undefined) {
                readFile(file, input === pdf ? 'pdf' : 'image');
            }
        });
        input.addEventListener('focus', () => card.classList.add('is-focus'));
        input.addEventListener('blur', () => card.classList.remove('is-focus'));
    }
    fileChange.addEventListener('click', () => changeInput.click());
    // On a computer a file can also be dropped on its cards
    for (const card of [pick, pickImage]) {
        card.addEventListener('dragover', (event) => {
            event.preventDefault();
            card.classList.add('is-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-over'));
        card.addEventListener('drop', (event) => {
            event.preventDefault();
            card.classList.remove('is-over');
            const file = event.dataTransfer?.files[0];
            if (file !== undefined) {
                readFile(file, kindOf(file));
            }
        });
    }

    // Shown only when the songs were read from a photo: its chords can come out wrong, and the person is the one who checks them
    const imageNote = h(
        'p',
        { class: 'import-note', role: 'note', hidden: true },
        icon('info', 18),
        h('span', {}, h('b', {}, 'Leído de una imagen.'), ' Revisa los acordes antes de guardar: algunos pueden venir mal (sobre todo los que llevan #).'),
    );
    const heading = h('h2', {}, 'Revisa el resultado');
    const hint = h('p', { class: 'help' }, 'Revisa los que tienen aviso.');
    const cards = h('div', { class: 'cards' });
    const saveError = h('p', { class: 'error', role: 'alert' });
    const footMessage = h('p', { class: 'import-foot__msg', role: 'status' });
    const save = h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar');
    // A file with several songs can also make a list of them (the person picks the template): shown from two marked songs
    const saveAndList = h('button', { type: 'button', class: 'button', hidden: true }, 'Guardar y crear listado');
    const review = h(
        'form',
        { class: 'form', hidden: true, novalidate: true },
        imageNote,
        heading,
        hint,
        cards,
        saveError,
        h('div', { class: 'actions edit-foot import-foot' }, footMessage, save, saveAndList, link(paths.list(), 'Cancelar', 'button')),
    );

    let current: Card[] = [];
    /** The rows as the list is made from them (import-list.ts) */
    const listRows = (): ImportRow[] =>
        current.map((card) => ({ included: card.include.checked, heldId: card.heldId, sameAs: card.sameAs, tags: card.tags.value() }));

    /** What the foot says and lets the person do, from the rows as they are now */
    const refreshFoot = (): void => {
        const foot = footOf(current.map((card) => ({ included: card.include.checked, title: card.title.value })));
        footMessage.textContent = foot.message;
        footMessage.hidden = foot.message === '';
        save.disabled = !foot.canSave;
        // A list of at least two songs can be made (the marked ones, and the ones the person already has); a title missing blocks it as it blocks Guardar
        saveAndList.hidden = entriesOf(listRows()).length < 2;
        saveAndList.disabled = current.some((card) => card.include.checked && card.title.value.trim() === '');
        save.textContent = foot.saving <= 1 ? 'Guardar canto' : `Guardar ${foot.saving} cantos`;
    };

    /**
     * Turns text into the rows of the review; returns how many songs it found.
     * `origin`: where the text comes from. The paste box's own (`paste`) stays in the box; a PDF's or a photo's text is not
     * put in it: it has page breaks and nothing to edit
     */
    async function convertNow(text: string = paste.value, origin: 'paste' | 'pdf' | 'image' = 'paste'): Promise<number> {
        const fromPaste = origin === 'paste';
        const imported = importMany(text).filter((song) => song.body !== '');
        if (imported.length === 0) {
            pasteError.textContent = fromPaste
                ? 'Pega primero el canto.'
                : origin === 'pdf'
                    ? 'No se encontró ningún canto en este PDF.'
                    : 'No se encontró ningún canto en la imagen. Prueba con más luz, la hoja de frente y sin sombras.';
            review.hidden = true;

            return 0;
        }
        imageNote.hidden = origin !== 'image';
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
        const firsts = firstOfBatch(imported);
        current = imported.map((song, index) =>
            card(song, index, imported.length, heldSong(song, saved)?.id ?? null, firsts[index] ?? index, offered, refreshFoot));
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
        shoot,
        pickImage,
        tip,
        h('p', { class: 'or' }, 'o'),
        h('label', { for: 'paste' }, 'Pegar el texto con los acordes'),
        paste,
        h('div', { class: 'actions' }, convert),
    );

    /** The same song, whichever row says it: the one the person already has, or the first of the repeats */
    const identity = (row: number): string => current[row]?.heldId ?? `new-${current[row]?.sameAs ?? row}`;
    const idOf = (row: number): string | null => {
        const card = current[row];

        return card === undefined ? null : (card.savedId ?? card.heldId ?? (card.sameAs !== row ? idOf(card.sameAs) : null));
    };
    /**
     * "Guardar y crear listado" once the template is picked: the songs are saved as with Guardar and a list is made with the
     * template's sections, each song in the one its tag names. What fits no section stays only in Cantos. The list opens, and
     * the notice can undo it (the list only: the songs stay).
     */
    const makeList = async (choice: TemplatePick): Promise<void> => {
        saveError.textContent = '';
        const { placed, leftOut } = planPlacements(entriesOf(listRows()), choice.parts, (a, b) => identity(a) === identity(b));
        if (placed.length === 0) {
            saveError.textContent = `Ninguno de los cantos encaja en las secciones de «${choice.name}». Elige otra plantilla (por ejemplo «En blanco»).`;

            return;
        }
        save.disabled = true;
        saveAndList.disabled = true;
        try {
            await saveAll(app, current, true);
        } catch (failure) {
            saveError.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar.';
            refreshFoot();

            return;
        }
        const seen = new Set<string>();
        const placements = placed.flatMap((place) => {
            const songId = idOf(place.key);
            const key = `${place.part}\u0000${songId ?? ''}`;
            if (songId === null || seen.has(key)) {
                return [];
            }
            seen.add(key);

            return [{ part: place.part, songId }];
        });
        try {
            const list = await app.setlists.createWithSongs({ title: defaultTitle(today(), choice.name) }, choice.parts, placements);
            if (choice.templateId !== null) {
                rememberTemplate(choice.templateId);
            }
            navigate(paths.setlist(list.id));
            showUndoToast(armedMessage(list.items.length, leftOut.length), 'Deshacer', () => {
                app.setlists
                    .remove(list.id)
                    .then(() => navigate(paths.lists()))
                    .catch(() => showToast('No se pudo deshacer.', 3500, true));
            });
        } catch (failure) {
            saveError.textContent = `Los cantos se guardaron, pero no se pudo armar el listado: ${failure instanceof Error ? failure.message : 'inténtalo de nuevo'}. Puedes armarlo desde Listados.`;
            refreshFoot();
        }
    };
    const pickSheet = createTemplatePickSheet(
        app,
        () => {
            const marked = current.filter((card) => card.include.checked).length;

            return marked === 0 ? 'Se arma el listado con los cantos que ya tienes.' : `${marked === 1 ? 'Se guarda 1 canto' : `Se guardan los ${marked} cantos`} y se arma el listado.`;
        },
        (choice) => void makeList(choice),
        (failure) => {
            saveError.textContent = failure instanceof Error ? failure.message : 'No se pudieron abrir las plantillas.';
        },
    );
    saveAndList.addEventListener('click', () => {
        saveError.textContent = '';
        pickSheet.open();
    });

    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Importar cantos'),
        h('p', {}, 'Sube un PDF, una foto o pega el texto con los acordes sobre la letra. Si trae varios cantos, se separan solos; los revisas antes de guardar.'),
        pdf,
        photo,
        gallery,
        fileCard,
        inputs,
        pasteError,
        review,
        pickSheet.element,
    );

    return { element, dispose: () => pickSheet.release() };
}

/** Saves the checked cards in order; a card with a problem is opened and nothing after it is lost */
async function saveAll(app: App, cards: Card[], allowNone = false): Promise<string[]> {
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
            card.savedId = song.id;
            // Saved: it must not be saved again if a later one fails and the person tries again
            card.include.checked = false;
            card.include.disabled = true;
        } catch (failure) {
            card.error.textContent = failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.';
            card.open();
            throw new Error(`Hay un problema en “${card.title.value || 'un canto sin título'}”. Corrígelo y vuelve a guardar.`);
        }
    }
    if (saved.length === 0 && !allowNone) {
        throw new Error('No hay ningún canto marcado para guardar.');
    }

    return saved;
}

/**
 * A row. `total`: how many songs the paste held (one song opens at once and has no mark to choose).
 * `heldId`: the id of the song the person already has that this is, or null. `sameAs`: the place of the first identical row of the import (its own when it is the first). `offered`: the tags a row
 * can offer to touch. `changed`: called when something the foot depends on changes.
 */
function card(song: Imported, index: number, total: number, heldId: string | null, sameAs: number, offered: readonly string[], changed: () => void): Card {
    const id = `card-${index}`;
    const have = heldId !== null;
    const repeated = sameAs !== index;
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

    return { element, include, title, author, body, tags, error, open: () => setOpen(true), savedId: null, heldId, sameAs };
}
