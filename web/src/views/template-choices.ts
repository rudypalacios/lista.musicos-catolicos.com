import type { App } from '../app.ts';
import { defaultTitle } from '../data/setlists.ts';
import { BLANK_NAME, blankSections, lastUsedFirst } from '../data/templates.ts';
import type { Setlist, Template } from '../data/types.ts';
import { today } from '../dates.ts';
import { h } from '../dom.ts';
import { readLastTemplate, rememberTemplate } from '../last-template.ts';
import { paths } from '../router.ts';
import { createSheet, sheetAction, type Sheet } from './sheet.ts';
import type { Navigate } from './types.ts';

export interface TemplateChoiceHandlers {
    /** A list was made from the template the person picked (or a blank one) */
    created: (list: Setlist) => void;
    /** The person wants the screen of the templates */
    manage: () => void;
    failed: (failure: unknown) => void;
}

/** "5 secciones" */
function sectionsText(count: number): string {
    return count === 1 ? '1 sección' : `${count} secciones`;
}

/**
 * The choices of "Selecciona una plantilla", as the rows of a sheet: the person's templates (the one used last
 * first), "En blanco" and, last and set apart, "Administrar plantillas". A person who has none yet (a device that has
 * not heard from the server) gets the Misa made first, as the app does after every sync.
 */
export async function templateChoices(app: App, handlers: TemplateChoiceHandlers, close: (then: () => void) => void): Promise<HTMLElement[]> {
    let all = await app.templates.list();
    if (all.length === 0) {
        await app.templates.ensureMisa();
        all = await app.templates.list();
    }
    const make = (name: string, parts: Template['parts'], remember: string | null): void => {
        close(() => {
            app.setlists
                .create({ title: defaultTitle(today(), name) }, parts)
                .then((list) => {
                    if (remember !== null) {
                        rememberTemplate(remember);
                    }
                    handlers.created(list);
                })
                .catch(handlers.failed);
        });
    };

    return [
        ...lastUsedFirst(all, readLastTemplate()).map((template) =>
            sheetAction('list', template.name, () => make(template.name, template.parts, template.id), { hint: sectionsText(template.parts.length) })),
        sheetAction('plus', 'En blanco', () => make(BLANK_NAME, blankSections(), null), { hint: 'Una sola sección, «Cantos»' }),
        // Last and set apart: where the templates are made, changed and deleted
        sheetAction('settings', 'Administrar plantillas', () => close(handlers.manage), { apart: true }),
    ];
}

/** The sheet of the lists screen's "＋ Nuevo": choose a template, and the list is made and opened */
export function createTemplateSheet(app: App, navigate: Navigate, fail: (failure: unknown) => void): Sheet {
    const sheet = createSheet('Selecciona una plantilla', () => fill());
    sheet.element.classList.add('sheet-layer--window');
    const fill = (): void => {
        sheet.body.replaceChildren(h('h4', { class: 'sheet__title' }, 'Nuevo listado'), h('p', { class: 'sheet__sub' }, 'Selecciona una plantilla'));
        templateChoices(app, {
            created: (list) => navigate(paths.setlist(list.id)),
            manage: () => navigate(paths.templates()),
            failed: fail,
        }, (then) => sheet.close(then))
            .then((rows) => sheet.body.append(...rows))
            .catch(fail);
    };

    return sheet;
}
