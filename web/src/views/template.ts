import type { App } from '../app.ts';
import { addedTo, movedIn, notedIn, optionalIn, renamedIn, withoutPart } from '../data/parts.ts';
import type { PartDef, Template } from '../data/types.ts';
import { LIMITS } from '../data/types.ts';
import { h } from '../dom.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import { createSectionEditor } from './section-editor.ts';
import type { Navigate, View } from './types.ts';

/**
 * One template: its name and its sections (the same editor as a list's, without on/off switches, with "optional" and
 * an explanation for each: a template lists what a new list starts with, so a section is there or it is not).
 *
 * Changes are held on the screen until "Guardar" (people expect to save): nothing is written before, "Cancelar" leaves
 * them, and the screen says while there is something unsaved. Lists already made from it are not touched.
 */
export function templateView(app: App, navigate: Navigate, initial: Template): View {
    let template = initial;
    let parts: readonly PartDef[] = initial.parts;
    const { templates } = app;
    const error = h('p', { class: 'error', role: 'alert' });
    const name = h('input', {
        type: 'text', id: 'template-name', maxlength: String(LIMITS.templateName), autocomplete: 'off', 'aria-label': 'Nombre de la plantilla',
    });
    const unsaved = h('p', { class: 'muted', hidden: true }, 'Hay cambios sin guardar.');
    const save = h('button', { type: 'button', class: 'button button--primary' }, 'Guardar');
    const cancel = h('a', { class: 'button', href: paths.templates(), 'data-link': true }, 'Cancelar');

    /** Each change touches the draft only: it redraws the editor and notes that there is something to save */
    const change = (next: readonly PartDef[]): Promise<void> => {
        parts = next;
        editor.update(parts);
        refresh();

        return Promise.resolve();
    };
    const editor = createSectionEditor({
        ops: {
            add: (section, base) => change(addedTo(parts, section, () => crypto.randomUUID(), base)),
            rename: (id, next) => change(renamedIn(parts, id, next)),
            move: (id, direction) => change(movedIn(parts, id, direction)),
            remove: (id) => change(withoutPart(parts, id)),
            setOptional: (id, optional) => change(optionalIn(parts, id, optional)),
            setNote: (id, note) => change(notedIn(parts, id, note)),
        },
    });
    const foot = h('div', { class: 'actions edit-foot' }, save, cancel);
    const element = h(
        'div',
        { class: 'page' },
        h('label', { class: 'sections__label', for: 'template-name' }, 'Nombre de la plantilla'),
        name,
        h('h2', {}, 'Secciones'),
        h('p', { class: 'muted' }, 'Con estas secciones empieza un listado nuevo. Cambiarlas no cambia los listados que ya hiciste.'),
        editor.element,
        unsaved,
        error,
        foot,
    );

    const isDirty = (): boolean => name.value.trim() !== template.name || JSON.stringify(parts) !== JSON.stringify(template.parts);
    const refresh = (): void => {
        unsaved.hidden = !isDirty();
    };
    const fill = (): void => {
        name.value = template.name;
        parts = template.parts;
        editor.update(parts);
        refresh();
    };

    name.addEventListener('input', refresh);
    name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            name.blur();
        }
    });
    save.addEventListener('click', () => {
        error.textContent = '';
        save.disabled = true;
        templates
            .update(template.id, { name: name.value, parts })
            .then(() => {
                showToast('Plantilla guardada', 3000, true);
                navigate(paths.templates());
            })
            .catch((failure: unknown) => {
                error.textContent = failure instanceof Error ? failure.message : 'No se pudo guardar la plantilla.';
                save.disabled = false;
            });
    });

    const stop = app.onData(() => {
        void templates.get(template.id).then((latest) => {
            if (latest === undefined) {
                // Deleted on another device while it was open
                navigate(paths.templates(), { replace: true });

                return;
            }
            // What the person is changing is not overwritten by what another device saved meanwhile
            const kept = isDirty();
            template = latest;
            if (!kept) {
                fill();
            }
        });
    });
    fill();

    return { element, dispose: stop };
}
