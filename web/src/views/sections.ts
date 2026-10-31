import type { App } from '../app.ts';
import { partsOf } from '../data/setlists.ts';
import { LIMITS, type PartDef, type Setlist } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon, type IconName } from '../icons.ts';
import { massSections } from '../mass.ts';
import type { Navigate, View } from './types.ts';

/** What a section says under its name when it cannot be switched off: the songs it holds */
export function lockedNote(count: number): string {
    return `${count === 1 ? '1 canto' : `${count} cantos`}: no se puede apagar`;
}

/** The sections of the Mass the list does not have (they can be added back, with their own ids and notes) */
export function missingFromMass(parts: readonly PartDef[]): PartDef[] {
    const have = new Set(parts.map((part) => part.id));

    return massSections().filter((part) => !have.has(part.id));
}

/**
 * The sections of one list. Each row has a switch (an off section is hidden on the list and kept here, so it comes
 * back where it was), its name (touch it to rename), the arrows that move it and "✕" that deletes it. A section that
 * holds songs stays on and cannot be deleted (it says why): nothing is hidden or left without a place. At the end,
 * a field to add a section of the person's own and the sections of the Mass the list does not have.
 */
export function sectionsView(app: App, _navigate: Navigate, initial: Setlist): View {
    let setlist = initial;
    /** The section being renamed: the screen is not redrawn under the field while someone types in it */
    let renaming: string | null = null;
    const error = h('p', { class: 'error', role: 'alert' });
    const list = h('ul', { class: 'lrows sections' });
    const extra = h('div', { class: 'sections__add' });
    const element = h(
        'div',
        { class: 'page' },
        h('h2', {}, 'Secciones del listado'),
        h('p', { class: 'muted' }, 'Enciende las que lleva este listado, cámbiales el nombre u ordénalas. Lo que apagas se oculta; no se pierde.'),
        error,
        list,
        extra,
    );

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

    const row = (part: PartDef, index: number, parts: readonly PartDef[], shown: number): HTMLElement => {
        const count = setlist.items.filter((item) => item.part === part.id).length;
        const on = part.off !== true;
        // The last one that is on stays on too: a list with no section has nowhere to put a song
        const locked = on && (count > 0 || shown === 1);
        const note = count > 0 ? lockedNote(count) : shown === 1 && on ? 'Es la única encendida' : on ? null : 'Apagada: se oculta en el listado';

        const toggle = h('button', {
            type: 'button',
            class: locked ? 'srow__switch is-locked' : 'srow__switch',
            role: 'switch',
            'aria-checked': String(on),
            'aria-disabled': String(locked),
            'aria-label': part.name,
            'data-focus': `section:${part.id}`,
        }, h('span', { class: on ? 'switch is-on' : 'switch', 'aria-hidden': 'true' }));
        toggle.addEventListener('click', () => {
            if (!locked) {
                run(app.setlists.setPartOff(setlist.id, part.id, on), 'No se pudo guardar el cambio.');
            }
        });

        const name = h('button', {
            type: 'button', class: 'srow__name', 'aria-label': `Cambiar el nombre: ${part.name}`, 'data-focus': `name:${part.id}`,
        },
        h('span', { class: on ? 'lrow__title' : 'lrow__title is-off' }, part.name,
            ...(part.optional === true ? [' ', h('span', { class: 'badge' }, 'opcional')] : [])),
        ...(note === null ? [] : [h('span', { class: 'lrow__detail' }, note)]));
        name.addEventListener('click', () => startRename(part, name));

        return h('li', { class: 'lrow srow' },
            toggle,
            name,
            iconButton('arrow-up', `Subir: ${part.name}`, index > 0, () => run(app.setlists.movePart(setlist.id, part.id, -1), 'No se pudo mover la sección.'), `up:${part.id}`),
            iconButton('arrow-down', `Bajar: ${part.name}`, index < parts.length - 1, () => run(app.setlists.movePart(setlist.id, part.id, 1), 'No se pudo mover la sección.'), `down:${part.id}`),
            iconButton('x', `Borrar: ${part.name}`, count === 0 && parts.length > 1, () => run(app.setlists.removePart(setlist.id, part.id), 'No se pudo borrar la sección.'), `remove:${part.id}`));
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
                run(app.setlists.renamePart(setlist.id, part.id, next), 'No se pudo cambiar el nombre.');
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

    const drawAdd = (parts: readonly PartDef[]): void => {
        if (parts.length >= LIMITS.parts) {
            extra.replaceChildren(h('p', { class: 'muted' }, `Un listado admite hasta ${LIMITS.parts} secciones.`));

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
            run(app.setlists.addPart(setlist.id, name), 'No se pudo agregar la sección.');
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
                    chip.addEventListener('click', () => run(app.setlists.addPart(setlist.id, part.name, part), 'No se pudo agregar la sección.'));

                    return chip;
                })),
            ]),
        );
    };

    const draw = (): void => {
        if (renaming !== null) {
            return;
        }
        const focused = document.activeElement?.getAttribute('data-focus') ?? null;
        const typed = (document.getElementById('new-section') as HTMLInputElement | null)?.value ?? '';
        const parts = partsOf(setlist);
        const shown = parts.filter((part) => part.off !== true).length;
        list.replaceChildren(...parts.map((part, index) => row(part, index, parts, shown)));
        drawAdd(parts);
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

    const stop = app.onData(() => {
        void app.setlists.get(setlist.id).then((latest) => {
            if (latest !== undefined) {
                setlist = latest;
                draw();
            }
        });
    });
    draw();

    return { element, dispose: stop };
}
