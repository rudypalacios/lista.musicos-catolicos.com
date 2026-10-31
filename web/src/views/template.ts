import type { App } from '../app.ts';
import type { Template } from '../data/types.ts';
import { LIMITS } from '../data/types.ts';
import { h } from '../dom.ts';
import { paths } from '../router.ts';
import { createSectionEditor } from './section-editor.ts';
import type { Navigate, View } from './types.ts';

/**
 * One template: its name, edited in place, and its sections (the same editor as a list's, without switches: a
 * template lists what a new list starts with, so a section is there or it is not). Everything is saved as it is
 * typed or touched, on the device first. Lists already made from it are not touched.
 */
export function templateView(app: App, navigate: Navigate, initial: Template): View {
    let template = initial;
    const { templates } = app;
    const error = h('p', { class: 'error', role: 'alert' });
    const name = h('input', {
        type: 'text', id: 'template-name', maxlength: String(LIMITS.templateName), autocomplete: 'off', 'aria-label': 'Nombre de la plantilla',
    });
    const editor = createSectionEditor({
        ops: {
            add: (section, base) => templates.addPart(template.id, section, base),
            rename: (id, next) => templates.renamePart(template.id, id, next),
            move: (id, direction) => templates.movePart(template.id, id, direction),
            remove: (id) => templates.removePart(template.id, id),
        },
    });
    const element = h(
        'div',
        { class: 'page' },
        h('label', { class: 'sections__label', for: 'template-name' }, 'Nombre de la plantilla'),
        name,
        error,
        h('h2', {}, 'Secciones'),
        h('p', { class: 'muted' }, 'Con estas secciones empieza un listado nuevo. Cambiarlas no cambia los listados que ya hiciste.'),
        editor.element,
    );

    const fill = (): void => {
        if (document.activeElement !== name) {
            name.value = template.name;
        }
        editor.update(template.parts);
    };
    const save = (): void => {
        error.textContent = '';
        const next = name.value.trim();
        if (next === template.name) {
            return;
        }
        templates.rename(template.id, next).catch((failure: unknown) => {
            error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar el nombre.';
            name.value = template.name;
        });
    };
    name.addEventListener('change', save);
    name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            name.blur();
        }
    });

    const stop = app.onData(() => {
        void templates.get(template.id).then((latest) => {
            if (latest === undefined) {
                // Deleted on another device while it was open
                navigate(paths.templates(), { replace: true });

                return;
            }
            template = latest;
            fill();
        });
    });
    fill();

    return { element, dispose: stop };
}
