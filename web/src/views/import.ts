import type { App } from '../app.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import { h, link, setSheet } from '../dom.ts';
import { importMany, type Imported } from '../importer.ts';
import { MASS_PARTS } from '../mass.ts';
import { paths } from '../router.ts';
import type { Navigate, View } from './types.ts';

/** One song found in the pasted text, with the fields the person can still change */
interface Card {
    element: HTMLElement;
    include: HTMLInputElement;
    title: HTMLInputElement;
    author: HTMLInputElement;
    body: HTMLTextAreaElement;
    error: HTMLElement;
}

/**
 * Bringing in songs written with the chords above the words: paste the text (one song, or a
 * whole Mass with one song per page), check what came out, fix it, save. The check is not
 * optional politeness: a chord's column depends on the spaces the paste kept, so it is often
 * a letter or two off.
 */
export function importView(app: App, navigate: Navigate): View {
    const paste = h('textarea', {
        id: 'paste', class: 'mono', spellcheck: 'false', autocapitalize: 'off', wrap: 'off',
        placeholder: 'ENTRADA: Caminamos con alegría\n\nC            Am\n1.  Un pueblo que espera el mañana,\n',
    });
    const convert = h('button', { type: 'button', class: 'button button--primary' }, 'Convertir');
    const pasteError = h('p', { class: 'error', role: 'alert' });

    const heading = h('h2', {}, 'Revisa el resultado');
    const cards = h('div', { class: 'cards' });
    const saveError = h('p', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar');
    const review = h(
        'form',
        { class: 'form', hidden: true, novalidate: true },
        heading,
        cards,
        saveError,
        h('div', { class: 'actions' }, save, link(paths.list(), 'Cancelar', 'button')),
    );

    let current: Card[] = [];

    convert.addEventListener('click', () => {
        const imported = importMany(paste.value).filter((song) => song.body !== '');
        if (imported.length === 0) {
            pasteError.textContent = 'Pega primero el canto.';
            review.hidden = true;
            return;
        }
        pasteError.textContent = '';
        saveError.textContent = '';
        current = imported.map((song, index) => card(song, index, imported.length));
        cards.replaceChildren(...current.map((c) => c.element));
        heading.textContent = imported.length === 1 ? 'Revisa el resultado' : `Se encontraron ${imported.length} cantos: revisa el resultado`;
        save.textContent = imported.length === 1 ? 'Guardar canto' : `Guardar ${imported.length} cantos`;
        review.hidden = false;
        review.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

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
                save.disabled = false;
            });
    });

    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Importar cantos'),
        h('p', {}, 'Pega los cantos como los tienes escritos, con los acordes en una línea arriba de la letra. Si pegas varios (una misa con un canto por hoja), se separan solos. Se convierten a ChordPro y los revisas antes de guardarlos.'),
        h('label', { for: 'paste' }, 'Texto'),
        paste,
        pasteError,
        h('div', { class: 'actions' }, convert),
        review,
    );

    return { element };
}

/** Saves the checked cards in order; a card with a problem is marked and nothing after it is lost */
async function saveAll(app: App, cards: Card[]): Promise<string[]> {
    const saved: string[] = [];
    for (const card of cards) {
        card.error.textContent = '';
        if (!card.include.checked) {
            continue;
        }
        try {
            const song = await app.create({ title: card.title.value, author: card.author.value, body: card.body.value });
            saved.push(song.id);
            // Saved: it must not be saved again if a later one fails and the person tries again
            card.include.checked = false;
            card.include.disabled = true;
        } catch (failure) {
            card.error.textContent = failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.';
            throw new Error(`Hay un problema en “${card.title.value || 'un canto sin título'}”. Corrígelo y vuelve a guardar.`);
        }
    }
    if (saved.length === 0) {
        throw new Error('No hay ningún canto marcado para guardar.');
    }

    return saved;
}

function card(song: Imported, index: number, total: number): Card {
    const id = `card-${index}`;
    const include = h('input', { type: 'checkbox', id: `${id}-include`, checked: true, 'aria-label': 'Guardar este canto' });
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
    const draw = (): void => setSheet(sheet, sheetHtml(parse(body.value)));
    body.addEventListener('input', draw);
    draw();

    const details = h(
        'details',
        { class: 'help', ...(total === 1 ? { open: true } : {}) },
        h('summary', {}, 'Revisar la letra y la vista previa'),
        h('label', { for: `${id}-body` }, 'Letra con acordes (ChordPro)'),
        body,
        h('section', { class: 'preview', 'aria-label': 'Vista previa' }, h('h3', {}, 'Vista previa'), sheet),
    );

    const element = h(
        'section',
        { class: 'import-card' },
        total > 1 ? h('label', { class: 'include' }, include, ' Importar este canto') : h('span', { hidden: true }, include),
        part !== undefined ? h('p', { class: 'help' }, `Parte de la misa que dice el encabezado: ${part.name}.`) : h('span', {}),
        notes,
        h('label', { for: `${id}-title` }, 'Título'),
        title,
        h('label', { for: `${id}-author` }, 'Autor (opcional)'),
        author,
        details,
        error,
    );

    return { element, include, title, author, body, error };
}
