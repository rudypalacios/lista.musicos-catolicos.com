import { cleanTags, sameTag } from '../data/tags.ts';
import { LIMITS } from '../data/types.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface TagFieldOptions {
    initial: readonly string[];
    /** The id of the text field, when more than one tag field is on the screen (the import review has one per song) */
    id?: string;
    /** The tags the person can touch instead of typing (the ones in use): the field shows the ones it does not have */
    suggestions: () => readonly string[];
    /** Called when the tags change (a draft or a form can tell it is dirty) */
    onChange?: () => void;
}

export interface TagField {
    element: HTMLElement;
    /** The tags now, with the one being typed (not yet confirmed) counted: pressing "Guardar" must not lose it */
    value(): string[];
    set(tags: readonly string[]): void;
    /** Draws the offered tags again (the ones in use were read after the field was made) */
    refresh(): void;
}

/**
 * The "Etiquetas" of a song, optional and below the lyrics (the lyrics stay near the top): the tags it has, each
 * a chip that goes away when touched; a field where Enter (or a comma) adds one; and the tags already in use, one
 * touch to add. At most `LIMITS.tags`, each `LIMITS.tag` characters.
 */
export function createTagField(options: TagFieldOptions): TagField {
    let tags: string[] = cleanTags(options.initial);
    const have = h('div', { class: 'tag-field__have' });
    const input = h('input', {
        type: 'text', id: options.id ?? 'tags', class: 'tag-field__input', placeholder: 'Agregar etiqueta', 'aria-label': 'Agregar etiqueta',
        maxlength: String(LIMITS.tag), autocomplete: 'off', enterkeyhint: 'done',
    });
    const offered = h('div', { class: 'tag-field__offered' });
    const full = h('p', { class: 'muted', hidden: true }, `Un canto admite hasta ${LIMITS.tags} etiquetas.`);
    const error = h('p', { class: 'error', role: 'alert' });
    const element = h('div', { class: 'tag-field' },
        h('label', { for: options.id ?? 'tags' }, 'Etiquetas ', h('span', { class: 'muted' }, '(opcional)')),
        have,
        h('div', { class: 'tag-field__add' }, icon('tag', 18), input),
        full,
        offered,
        error);

    const change = (next: string[]): void => {
        tags = next;
        draw();
        options.onChange?.();
    };
    const add = (text: string): void => {
        error.textContent = '';
        try {
            const next = cleanTags([...tags, text]);
            if (next.length !== tags.length) {
                change(next);
            }
        } catch (failure) {
            error.textContent = failure instanceof Error ? failure.message : 'No se pudo agregar la etiqueta.';
        }
    };
    const confirmTyped = (): void => {
        const typed = input.value.trim();
        if (typed !== '') {
            input.value = '';
            add(typed);
        }
    };
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ',') {
            // Enter would send the form; the comma is how a list of tags is written
            event.preventDefault();
            confirmTyped();
        } else if (event.key === 'Backspace' && input.value === '' && tags.length > 0) {
            change(tags.slice(0, -1));
        }
    });

    const draw = (): void => {
        have.replaceChildren(...tags.map((tag) => {
            const chip = h('button', { type: 'button', class: 'tag-chip', 'aria-label': `Quitar la etiqueta ${tag}` }, tag, icon('x', 14));
            chip.addEventListener('click', () => change(tags.filter((candidate) => candidate !== tag)));

            return chip;
        }));
        const atLimit = tags.length >= LIMITS.tags;
        input.disabled = atLimit;
        full.hidden = !atLimit;
        const rest = atLimit ? [] : options.suggestions().filter((tag) => !tags.some((mine) => sameTag(mine, tag))).slice(0, 12);
        offered.replaceChildren(
            ...(rest.length === 0 ? [] : [h('p', { class: 'tag-field__label' }, 'Ya usadas')]),
            ...rest.map((tag) => {
                const chip = h('button', { type: 'button', class: 'pick-chip' }, icon('plus', 14), tag);
                chip.addEventListener('click', () => add(tag));

                return chip;
            }),
        );
    };
    draw();

    return {
        element,
        value: () => {
            const typed = input.value.trim();

            return typed === '' ? [...tags] : cleanTags([...tags, typed]);
        },
        set: (next) => {
            tags = cleanTags(next);
            draw();
        },
        refresh: draw,
    };
}
