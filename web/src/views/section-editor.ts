import type { PartDef } from '../data/types.ts';
import { LIMITS } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { massSections } from '../mass.ts';

/** What a section says under its name when it cannot be switched off: the songs it holds */
export function lockedNote(count: number): string {
    return `${count === 1 ? '1 canto' : `${count} cantos`}: no se puede apagar`;
}

/** The sections of the Mass that are not among `parts` (they can be added back, with their own ids and notes) */
export function missingFromMass(parts: readonly PartDef[]): PartDef[] {
    const have = new Set(parts.map((part) => part.id));

    return massSections().filter((part) => !have.has(part.id));
}

/** What the editor asks of whatever holds the sections: a list, or a template */
export interface SectionOps {
    /** Switch a section off or on. Left out where a section is simply there or not (a template) */
    setOff?: (id: string, off: boolean) => Promise<unknown>;
    add: (name: string, section?: PartDef) => Promise<unknown>;
    rename: (id: string, name: string) => Promise<unknown>;
    move: (id: string, direction: -1 | 1) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
    /** Mark a section optional or not. Left out where that is not the owner's to say (a list takes it from its template) */
    setOptional?: (id: string, optional: boolean) => Promise<unknown>;
    /** Set the explanation a section shows (empty removes it). Goes with `setOptional` */
    setNote?: (id: string, note: string) => Promise<unknown>;
}

export interface SectionEditorOptions {
    ops: SectionOps;
    /** How many songs a section holds (a list); a section with songs cannot be switched off or deleted */
    countOf?: (id: string) => number;
}

export interface SectionEditor {
    element: HTMLElement;
    /** Draws the sections as they are now (after a change, here or on another device) */
    update(parts: readonly PartDef[]): void;
}

/**
 * The rows that edit sections, the same for a list and for a template. Each row has, when the owner of the sections
 * can switch them (`ops.setOff`), a switch (an off section is hidden and kept, so it comes back where it was), its
 * name (touch it to rename), when it can say what is optional (`ops.setOptional`) a button that opens whether the
 * section is optional and the explanation it shows, the arrows that move it and "✕" that deletes it. A section with songs stays on and
 * cannot be deleted (it says why), and the last one stays too. At the end, a field to add a section of the person's
 * own and the sections of the Mass that are missing.
 */
export function createSectionEditor(options: SectionEditorOptions): SectionEditor {
    const { ops } = options;
    const countOf = options.countOf ?? ((): number => 0);
    let parts: readonly PartDef[] = [];
    /** The section being renamed: the screen is not redrawn under the field while someone types in it */
    let renaming: string | null = null;
    /** The sections whose details (optional, explanation) are open, and whether the explanation is being typed */
    const opened = new Set<string>();
    let noting = false;
    const error = h('p', { class: 'error', role: 'alert' });
    const list = h('ul', { class: 'lrows sections' });
    const extra = h('div', { class: 'sections__add' });
    const element = h('div', { class: 'section-editor' }, error, list, extra);

    const run = (work: Promise<unknown>, fallback: string): void => {
        error.textContent = '';
        work.catch((failure: unknown) => {
            error.textContent = failure instanceof Error ? failure.message : fallback;
        });
    };

    const iconButton = (name: IconName, label: string, enabled: boolean, onTouch: () => void, focus: string): HTMLButtonElement => {
        const button = h('button', {
            type: 'button', class: 'srow__tool', 'aria-label': label, 'data-focus': focus, ...(enabled ? {} : { disabled: true }),
        }, icon(name, 20));
        button.addEventListener('click', onTouch);

        return button;
    };

    const row = (part: PartDef, index: number, shown: number): HTMLElement => {
        const count = countOf(part.id);
        const on = part.off !== true;
        // The last one that is on stays on too: nothing could be put anywhere without a section
        const locked = on && (count > 0 || shown === 1);
        const note = count > 0 ? lockedNote(count) : shown === 1 && on && ops.setOff !== undefined ? 'Es la única encendida' : on ? null : 'Apagada: se oculta en el listado';

        const name = h('button', {
            type: 'button', class: 'srow__name', 'aria-label': `Cambiar el nombre: ${part.name}`, 'data-focus': `name:${part.id}`,
        },
        h('span', { class: on ? 'lrow__title' : 'lrow__title is-off' }, part.name,
            ...(part.optional === true ? [' ', h('span', { class: 'badge' }, 'opcional')] : [])),
        ...(note === null ? [] : [h('span', { class: 'lrow__detail' }, note)]));
        name.addEventListener('click', () => startRename(part, name));

        const switcher = ops.setOff;
        const toggle = switcher === undefined ? [] : [(() => {
            const button = h('button', {
                type: 'button',
                class: locked ? 'srow__switch is-locked' : 'srow__switch',
                role: 'switch',
                'aria-checked': String(on),
                'aria-disabled': String(locked),
                'aria-label': part.name,
                'data-focus': `section:${part.id}`,
            }, h('span', { class: on ? 'switch is-on' : 'switch', 'aria-hidden': 'true' }));
            button.addEventListener('click', () => {
                if (!locked) {
                    run(switcher(part.id, on), 'No se pudo guardar el cambio.');
                }
            });

            return button;
        })()];

        const details = ops.setOptional === undefined ? [] : [detailsButton(part)];

        return h('li', { class: 'lrow srow' },
            ...toggle,
            name,
            ...details,
            iconButton('arrow-up', `Subir: ${part.name}`, index > 0, () => run(ops.move(part.id, -1), 'No se pudo mover la sección.'), `up:${part.id}`),
            iconButton('arrow-down', `Bajar: ${part.name}`, index < parts.length - 1, () => run(ops.move(part.id, 1), 'No se pudo mover la sección.'), `down:${part.id}`),
            iconButton('x', `Borrar: ${part.name}`, count === 0 && parts.length > 1, () => run(ops.remove(part.id), 'No se pudo borrar la sección.'), `remove:${part.id}`),
            ...(opened.has(part.id) ? [detailsPanel(part)] : []));
    };

    /** Opens or closes the details of a section: whether it is optional and the explanation people read in the list */
    const detailsButton = (part: PartDef): HTMLButtonElement => {
        const open = opened.has(part.id);
        const button = h('button', {
            type: 'button', class: 'srow__tool', 'aria-label': `Opcional y explicación: ${part.name}`, 'aria-expanded': String(open),
            'data-focus': `details:${part.id}`,
        }, icon('info', 20));
        button.addEventListener('click', () => {
            if (!opened.delete(part.id)) {
                opened.add(part.id);
            }
            draw();
        });

        return button;
    };

    const detailsPanel = (part: PartDef): HTMLElement => {
        const optional = part.optional === true;
        const toggle = h('button', {
            type: 'button', class: 'srow__optional', role: 'switch', 'aria-checked': String(optional), 'data-focus': `optional:${part.id}`,
        }, h('span', { class: optional ? 'switch is-on' : 'switch', 'aria-hidden': 'true' }),
        h('span', {}, 'Opcional: se puede cantar sin un canto aquí'));
        toggle.addEventListener('click', () => run(ops.setOptional?.(part.id, !optional) ?? Promise.resolve(), 'No se pudo guardar el cambio.'));
        const field = h('textarea', {
            class: 'srow__note', rows: '3', maxlength: String(LIMITS.partNote), id: `note-${part.id}`, 'data-focus': `note:${part.id}`,
            placeholder: 'Por ejemplo: la canta la asamblea después de la consagración',
        });
        field.value = part.note ?? '';
        field.addEventListener('focus', () => {
            noting = true;
        });
        field.addEventListener('blur', () => {
            noting = false;
        });
        // The explanation is held as it is typed; the screen is not redrawn under the cursor
        field.addEventListener('input', () => run(ops.setNote?.(part.id, field.value) ?? Promise.resolve(), 'No se pudo guardar la explicación.'));

        return h('div', { class: 'srow__details' },
            toggle,
            h('label', { class: 'sections__label', for: `note-${part.id}` }, 'Explicación (se ve en el listado, junto a la sección)'),
            field);
    };

    /** The name turns into a field: Enter or leaving it saves, Escape leaves the name as it was */
    const startRename = (part: PartDef, where: HTMLElement): void => {
        renaming = part.id;
        const field = h('input', {
            type: 'text', class: 'srow__field', value: part.name, maxlength: String(LIMITS.partName), 'aria-label': `Nombre de la sección: ${part.name}`, autocomplete: 'off',
        });
        let finished = false;
        const finish = (save: boolean): void => {
            if (finished) {
                return;
            }
            finished = true;
            renaming = null;
            const next = field.value.trim();
            if (save && next !== '' && next !== part.name) {
                run(ops.rename(part.id, next), 'No se pudo cambiar el nombre.');
            }
            draw();
        };
        field.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                finish(true);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finish(false);
            }
        });
        field.addEventListener('blur', () => finish(true));
        where.replaceWith(field);
        field.focus();
        field.select();
    };

    const drawAdd = (): void => {
        if (parts.length >= LIMITS.parts) {
            extra.replaceChildren(h('p', { class: 'muted' }, `Se admiten hasta ${LIMITS.parts} secciones.`));

            return;
        }
        const field = h('input', {
            type: 'text', id: 'new-section', class: 'srow__field', placeholder: 'Nombre de la sección', 'aria-label': 'Nombre de la sección nueva',
            maxlength: String(LIMITS.partName), autocomplete: 'off', enterkeyhint: 'done',
        });
        const add = h('button', { type: 'button', class: 'button button--primary' }, icon('plus', 16), 'Agregar');
        const submit = (): void => {
            const name = field.value.trim();
            if (name === '') {
                field.focus();

                return;
            }
            field.value = '';
            run(ops.add(name), 'No se pudo agregar la sección.');
        };
        add.addEventListener('click', submit);
        field.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submit();
            }
        });
        const missing = missingFromMass(parts);
        extra.replaceChildren(
            h('h3', { class: 'sections__label' }, 'Agregar sección'),
            h('div', { class: 'sections__new' }, field, add),
            ...(missing.length === 0 ? [] : [
                h('h3', { class: 'sections__label' }, 'O una de la Misa'),
                h('div', { class: 'sections__chips' }, ...missing.map((part) => {
                    const chip = h('button', { type: 'button', class: 'pick-chip', 'data-focus': `mass:${part.id}` }, icon('plus', 14), part.name);
                    chip.addEventListener('click', () => run(ops.add(part.name, part), 'No se pudo agregar la sección.'));

                    return chip;
                })),
            ]),
        );
    };

    const draw = (): void => {
        if (renaming !== null || noting) {
            return;
        }
        const focused = document.activeElement?.getAttribute('data-focus') ?? null;
        const typed = (document.getElementById('new-section') as HTMLInputElement | null)?.value ?? '';
        const shown = parts.filter((part) => part.off !== true).length;
        list.replaceChildren(...parts.map((part, index) => row(part, index, shown)));
        drawAdd();
        const field = document.getElementById('new-section') as HTMLInputElement | null;
        if (field !== null && typed !== '') {
            field.value = typed;
        }
        if (focused !== null) {
            const again = element.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`);
            // A button that is now disabled (the section reached an end) cannot hold the focus: keep it on the row
            (again instanceof HTMLButtonElement && again.disabled ? element.querySelector<HTMLElement>(`[data-focus="${CSS.escape(`name:${focused.split(':')[1] ?? ''}`)}"]`) : again)?.focus();
        }
    };

    return {
        element,
        update: (next) => {
            parts = next;
            draw();
        },
    };
}
