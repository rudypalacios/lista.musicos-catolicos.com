import type { App } from '../app.ts';
import { blankSections } from '../data/templates.ts';
import type { Template } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { paths } from '../router.ts';
import { showToast } from '../toast.ts';
import { confirmDialog } from './confirm-dialog.ts';
import { createSheet, sheetAction } from './sheet.ts';
import type { Navigate, View } from './types.ts';

/** The name a new template starts with, before the person gives it its own */
const NEW_NAME = 'Plantilla nueva';

/** "5 secciones" */
function sectionsText(count: number): string {
    return count === 1 ? '1 sección' : `${count} secciones`;
}

/**
 * The person's templates ("Administrar plantillas"): the sections a new list starts with. Touching one opens it to
 * change its name and its sections; "⋯" copies or deletes it (after a question); "Nueva plantilla" makes one with a
 * single section and opens it. Changing or deleting a template never touches the lists made from it.
 */
export function templatesView(app: App, navigate: Navigate): View {
    const error = h('p', { class: 'error', role: 'alert' });
    const rows = h('ul', { class: 'lrows' });
    const empty = h('p', { class: 'empty', hidden: true }, 'Todavía no hay plantillas.');
    const add = h('button', { type: 'button', class: 'button' }, icon('plus', 16), 'Nueva plantilla');
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Plantillas'),
        h('p', { class: 'muted' }, 'Las secciones con que empieza un listado nuevo. Cambiar una plantilla no cambia los listados que ya hiciste.'),
        error,
        rows,
        empty,
        h('div', { class: 'actions' }, add),
    );
    const fail = (failure: unknown, fallback: string): void => {
        error.textContent = failure instanceof Error ? failure.message : fallback;
    };

    add.addEventListener('click', () => {
        error.textContent = '';
        app.templates
            .create(NEW_NAME, blankSections())
            .then((made) => navigate(paths.template(made.id)))
            .catch((failure: unknown) => fail(failure, 'No se pudo crear la plantilla.'));
    });

    // --- "⋯" of a row ---
    let templates: Template[] = [];
    let target: string | null = null;
    const sheet = createSheet('Opciones de la plantilla', () => fill());
    sheet.element.classList.add('sheet-layer--window');
    element.append(sheet.element);
    const fill = (): void => {
        const template = templates.find((candidate) => candidate.id === target);
        if (template === undefined) {
            // Deleted (here or on another device) while its sheet was open
            sheet.close();

            return;
        }
        sheet.body.replaceChildren(
            h('h4', { class: 'sheet__title' }, template.name),
            h('p', { class: 'sheet__sub' }, sectionsText(template.parts.length)),
            sheetAction('copy', 'Duplicar plantilla', () => {
                error.textContent = '';
                sheet.close(() => {
                    app.templates
                        .duplicate(template.id)
                        .then((copy) => {
                            navigate(paths.template(copy.id));
                            showToast(`Copiada de «${template.name}»`, 4000, true);
                        })
                        .catch((failure: unknown) => fail(failure, 'No se pudo duplicar la plantilla.'));
                });
            }, { hint: 'Una copia con las mismas secciones' }),
            // Last and set apart, so it is not touched by mistake next to the other
            sheetAction('trash', 'Eliminar plantilla', () => {
                error.textContent = '';
                sheet.close(() => {
                    confirmDialog({
                        title: `¿Eliminar la plantilla «${template.name}»?`,
                        text: 'Los listados que ya hiciste con ella no cambian. No se puede deshacer.',
                        confirm: 'Eliminar',
                        danger: true,
                    })
                        .then(async (confirmed) => {
                            if (confirmed) {
                                await app.templates.remove(template.id);
                                showToast('Plantilla eliminada', 3000, true);
                            }
                        })
                        .catch((failure: unknown) => fail(failure, 'No se pudo eliminar la plantilla.'));
                });
            }, { danger: true, apart: true }),
        );
    };

    const row = (template: Template): HTMLElement => {
        const more = h('button', {
            type: 'button', class: 'lrow__more', 'aria-label': `Más opciones: ${template.name}`, 'data-more': template.id,
        }, icon('more', 22));
        more.addEventListener('click', () => {
            target = template.id;
            sheet.open();
        });

        return h('li', { class: 'lrow' },
            h('a', { class: 'lrow__link', href: paths.template(template.id), 'data-link': true },
                h('span', { class: 'lrow__title' }, template.name),
                h('span', { class: 'lrow__detail' }, sectionsText(template.parts.length))),
            more);
    };

    const draw = (): void => {
        rows.replaceChildren(...templates.map(row));
        empty.hidden = templates.length > 0;
        if (sheet.isOpen()) {
            fill();
        }
    };
    const load = (): void => {
        app.templates.list().then((all) => {
            templates = all;
            draw();
        }).catch((failure: unknown) => fail(failure, 'No se pudieron leer las plantillas.'));
    };
    const stop = app.onData(load);
    load();

    return { element, dispose: () => {
        stop();
        sheet.release();
    } };
}
