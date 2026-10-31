import type { App } from '../app.ts';
import { partsOf } from '../data/setlists.ts';
import type { Setlist } from '../data/types.ts';
import { LIMITS } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { showToast } from '../toast.ts';
import { createSectionEditor } from './section-editor.ts';
import type { Navigate, View } from './types.ts';

/**
 * The sections of one list (`⋯` → "Secciones del listado"): the editor of sections with a switch on each row (a
 * section with songs stays on and cannot be deleted), and at the end "Guardar como plantilla", which keeps the
 * sections the list shows as a template a new list can start from.
 */
export function sectionsView(app: App, _navigate: Navigate, initial: Setlist): View {
    let setlist = initial;
    const { setlists } = app;
    const editor = createSectionEditor({
        countOf: (id) => setlist.items.filter((item) => item.part === id).length,
        ops: {
            setOff: (id, off) => setlists.setPartOff(setlist.id, id, off),
            add: (name, section) => setlists.addPart(setlist.id, name, section),
            rename: (id, name) => setlists.renamePart(setlist.id, id, name),
            move: (id, direction) => setlists.movePart(setlist.id, id, direction),
            remove: (id) => setlists.removePart(setlist.id, id),
        },
    });

    // --- "Guardar como plantilla": the name starts as the list's, and the person changes it ---
    const name = h('input', {
        type: 'text', id: 'template-name', class: 'srow__field', maxlength: String(LIMITS.templateName), autocomplete: 'off',
        'aria-label': 'Nombre de la plantilla', value: initial.title.slice(0, LIMITS.templateName),
    });
    const save = h('button', { type: 'button', class: 'button' }, icon('plus', 16), 'Guardar como plantilla');
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = (): void => {
        error.textContent = '';
        app.templates.fromList(name.value, setlist).then((made) => {
            showToast(`Plantilla «${made.name}» guardada`, 4000, true);
        }).catch((failure: unknown) => {
            error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar la plantilla.';
        });
    };
    save.addEventListener('click', submit);
    name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
    });

    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Secciones del listado'),
        h('p', { class: 'muted' }, 'Enciende las que lleva este listado, cámbiales el nombre u ordénalas. Lo que apagas se oculta; no se pierde.'),
        editor.element,
        h('div', { class: 'sections__add' },
            h('h3', { class: 'sections__label' }, 'Plantilla'),
            h('p', { class: 'muted' }, 'Guarda estas secciones para empezar otros listados con ellas.'),
            h('div', { class: 'sections__new' }, name, save),
            error),
    );

    const show = (): void => editor.update(partsOf(setlist));
    const stop = app.onData(() => {
        void setlists.get(setlist.id).then((latest) => {
            if (latest !== undefined) {
                setlist = latest;
                show();
            }
        });
    });
    show();

    return { element, dispose: stop };
}
