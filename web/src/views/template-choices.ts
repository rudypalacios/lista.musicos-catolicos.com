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

/** What the person picked: the sections a list starts with, under the name its title is made from */
export interface TemplatePick {
    name: string;
    parts: Template['parts'];
    /** The template's id (to remember it as the last one used), or null for a blank list */
    templateId: string | null;
}

/**
 * The rows of "Selecciona una plantilla": the person's templates (the one used last first), "En blanco" and, when `manage` is
 * given, last and set apart, "Administrar plantillas". A person who has none yet (a device that has not heard from the server)
 * gets the Misa made first, as the app does after every sync. `close` puts the sheet away before `pick` runs.
 */
export async function templateRows(
    app: App,
    pick: (choice: TemplatePick) => void,
    manage: (() => void) | null,
    close: (then: () => void) => void,
): Promise<HTMLElement[]> {
    let all = await app.templates.list();
    if (all.length === 0) {
        await app.templates.ensureMisa();
        all = await app.templates.list();
    }

    return [
        ...lastUsedFirst(all, readLastTemplate()).map((template) =>
            sheetAction('list', template.name, () => close(() => pick({ name: template.name, parts: template.parts, templateId: template.id })), { hint: sectionsText(template.parts.length) })),
        sheetAction('plus', 'En blanco', () => close(() => pick({ name: BLANK_NAME, parts: blankSections(), templateId: null })), { hint: 'Una sola sección, «Cantos»' }),
        // Last and set apart: where the templates are made, changed and deleted
        ...(manage === null ? [] : [sheetAction('settings', 'Administrar plantillas', () => close(manage), { apart: true })]),
    ];
}

/** "Selecciona una plantilla" for "＋ Nuevo": picking one makes the list, empty, for today */
export function templateChoices(app: App, handlers: TemplateChoiceHandlers, close: (then: () => void) => void): Promise<HTMLElement[]> {
    return templateRows(app, (choice) => {
        app.setlists
            .create({ title: defaultTitle(today(), choice.name) }, choice.parts)
            .then((list) => {
                if (choice.templateId !== null) {
                    rememberTemplate(choice.templateId);
                }
                handlers.created(list);
            })
            .catch(handlers.failed);
    }, handlers.manage, close);
}

/**
 * The same sheet to choose a template for something that makes the list itself (a list from an import): picking one only says
 * which. It has no "Administrar plantillas": going there would leave what the person is in the middle of.
 *
 * @param sub the line under the title, written when the sheet opens (what picking will do)
 */
export function createTemplatePickSheet(app: App, sub: () => string, pick: (choice: TemplatePick) => void, fail: (failure: unknown) => void): Sheet {
    const sheet = createSheet('Selecciona una plantilla', () => fill());
    sheet.element.classList.add('sheet-layer--window');
    const fill = (): void => {
        sheet.body.replaceChildren(h('h4', { class: 'sheet__title' }, 'Selecciona una plantilla'), h('p', { class: 'sheet__sub' }, sub()));
        templateRows(app, pick, null, (then) => sheet.close(then))
            .then((rows) => sheet.body.append(...rows))
            .catch(fail);
    };

    return sheet;
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
