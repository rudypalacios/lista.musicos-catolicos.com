import type { App } from '../app.ts';
import { parse } from '../chordpro/parser.ts';
import { sheetHtml } from '../chordpro/sheet.ts';
import { ValidationError } from '../data/library.ts';
import { h, link, setSheet } from '../dom.ts';
import { importChordsOverLyrics } from '../importer.ts';
import { MASS_PARTS } from '../mass.ts';
import { paths } from '../router.ts';
import type { Navigate, View } from './types.ts';

/**
 * Bringing in a song written with the chords above the words: paste it, check what came out,
 * fix it, save. The check is not optional politeness: a chord's column depends on the spaces
 * the paste kept, so it is often a letter or two off.
 */
export function importView(app: App, navigate: Navigate): View {
    const paste = h('textarea', {
        id: 'paste', class: 'mono', spellcheck: 'false', autocapitalize: 'off', wrap: 'off',
        placeholder: 'ENTRADA: Vienen con alegría\n\nC            Am\nVienen trayendo la esperanza,\n',
    });
    const convert = h('button', { type: 'button', class: 'button button--primary' }, 'Convertir');

    const title = h('input', { id: 'i-title', type: 'text', autocomplete: 'off' });
    const author = h('input', { id: 'i-author', type: 'text', autocomplete: 'off' });
    const body = h('textarea', { id: 'i-body', class: 'mono', spellcheck: 'false', autocapitalize: 'off' });
    const part = h('p', { class: 'help' });
    const notes = h('ul', { class: 'notes' });
    const sheet = h('div', { class: 'song-sheet' });
    const error = h('p', { class: 'error', role: 'alert' });
    const save = h('button', { type: 'submit', class: 'button button--primary' }, 'Guardar canto');

    const review = h(
        'form',
        { class: 'form', hidden: true, novalidate: true },
        h('h2', {}, 'Revisa el resultado'),
        part,
        notes,
        h('label', { for: 'i-title' }, 'Título'),
        title,
        h('label', { for: 'i-author' }, 'Autor (opcional)'),
        author,
        h('label', { for: 'i-body' }, 'Letra con acordes (ChordPro)'),
        body,
        h('section', { class: 'preview', 'aria-label': 'Vista previa' }, h('h3', {}, 'Vista previa'), sheet),
        error,
        h('div', { class: 'actions' }, save, link(paths.list(), 'Cancelar', 'button')),
    );

    const drawPreview = (): void => setSheet(sheet, sheetHtml(parse(body.value)));
    body.addEventListener('input', drawPreview);

    convert.addEventListener('click', () => {
        const imported = importChordsOverLyrics(paste.value);
        if (imported.body === '') {
            error.textContent = 'Pega primero el canto.';
            review.hidden = false;
            return;
        }
        error.textContent = '';
        title.value = imported.title;
        author.value = imported.author;
        body.value = imported.body;
        const found = MASS_PARTS.find((p) => p.id === imported.part);
        part.textContent = found !== undefined ? `Parte de la misa que dice el encabezado: ${found.name}.` : '';
        notes.replaceChildren(...imported.warnings.map((warning) => h('li', {}, warning)));
        drawPreview();
        review.hidden = false;
        review.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    review.addEventListener('submit', (event) => {
        event.preventDefault();
        error.textContent = '';
        save.disabled = true;
        app.create({ title: title.value, author: author.value, body: body.value })
            .then((song) => navigate(paths.view(song.id)))
            .catch((failure: unknown) => {
                error.textContent = failure instanceof ValidationError || failure instanceof Error ? failure.message : 'No se pudo guardar.';
                save.disabled = false;
            });
    });

    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Importar un canto'),
        h('p', {}, 'Pega el canto como lo tienes escrito, con los acordes en una línea arriba de la letra. Se convierte a ChordPro y lo revisas antes de guardarlo.'),
        h('label', { for: 'paste' }, 'Canto'),
        paste,
        h('div', { class: 'actions' }, convert),
        review,
    );

    return { element };
}
