import { massSections } from '../mass.ts';
import { ValidationError } from './library.ts';
import { addedTo, cleanParts, movedIn, renamedIn, withoutPart } from './parts.ts';
import type { LocalStore } from './store.ts';
import { LIMITS, type PartDef, type Setlist, type Template } from './types.ts';

/**
 * The Misa is the first template, made by the app. It has a fixed id, the same on every device: two devices that make
 * it before they meet make the same record, which the newest-edit-wins rule then keeps once (a made-up id each would
 * leave two Misas).
 */
export const MISA_ID = '00000000-0000-4000-8000-00000000a115';

/** What a list made with no template starts with: one section where everything goes */
export const BLANK_NAME = 'Listado';

const COPY_PREFIX = 'Copia de ';

/** The sections of a blank list: one, with an id of its own */
export function blankSections(newId: () => string = () => crypto.randomUUID()): PartDef[] {
    return addedTo([], 'Cantos', newId);
}

/** The templates by name, so they stay where the person left them */
export function byName(a: Template, b: Template): number {
    return a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id);
}

/** The templates with the one used last first (what the person makes most is at hand), the rest by name */
export function lastUsedFirst(templates: readonly Template[], lastId: string | null): Template[] {
    const sorted = [...templates].sort(byName);
    const last = sorted.find((template) => template.id === lastId);

    return last === undefined ? sorted : [last, ...sorted.filter((template) => template !== last)];
}

/** The name of a copy: "Copia de" and the name it comes from, cut to the longest name a template may have */
export function copyName(name: string): string {
    const full = name.startsWith(COPY_PREFIX) ? name : `${COPY_PREFIX}${name}`;

    return Array.from(full).slice(0, LIMITS.templateName).join('').trim();
}

/**
 * The person's templates on this device: the sections a new list starts with. Like the library and the lists,
 * everything goes to the local store first (queued for the server), so it works with no connection, and each change
 * reads the template, changes it and writes it back one after another.
 */
export class Templates {
    private readonly store: LocalStore;
    private readonly afterWrite: () => void;
    private readonly now: () => number;
    private readonly newId: () => string;
    private tail: Promise<unknown> = Promise.resolve();

    /** @param afterWrite called once a change is saved (the app refreshes and syncs) */
    constructor(
        store: LocalStore,
        afterWrite: () => void = () => undefined,
        now: () => number = Date.now,
        newId: () => string = () => crypto.randomUUID(),
    ) {
        this.store = store;
        this.afterWrite = afterWrite;
        this.now = now;
        this.newId = newId;
    }

    /** The templates that are not deleted, by name */
    async list(): Promise<Template[]> {
        return (await this.store.all('templates')).filter((template) => template.deletedAt === null).sort(byName);
    }

    /** A template, or undefined if it does not exist or was deleted */
    async get(id: string): Promise<Template | undefined> {
        const template = await this.store.get('templates', id);

        return template !== undefined && template.deletedAt === null ? template : undefined;
    }

    /**
     * Makes the Misa the first time: when this device (after hearing from the server) holds no record of it, not even a
     * deleted one, so a Misa the person deleted does not come back. Returns whether it made it.
     */
    ensureMisa(): Promise<boolean> {
        return this.serial(async () => {
            if ((await this.store.get('templates', MISA_ID)) !== undefined) {
                return false;
            }
            await this.store.save('templates', { id: MISA_ID, name: 'Misa', parts: massSections(), updatedAt: this.now(), deletedAt: null });
            this.afterWrite();

            return true;
        });
    }

    /**
     * A template with the sections given (a copy, with the ones switched off dropped: a template lists what a list
     * starts with). @throws ValidationError (as a rejected promise)
     */
    create(name: string, parts: readonly PartDef[]): Promise<Template> {
        return this.serial(async () => {
            const clean = cleanName(name);
            if ((await this.list()).length >= LIMITS.templates) {
                throw new ValidationError(`Se admiten hasta ${LIMITS.templates} plantillas.`);
            }
            const template: Template = {
                id: this.newId(),
                name: clean,
                parts: cleanParts(parts.filter((part) => part.off !== true).map(({ off: _off, ...rest }) => rest), []),
                updatedAt: this.now(),
                deletedAt: null,
            };
            await this.store.save('templates', template);
            this.afterWrite();

            return template;
        });
    }

    /** The template of a list: its sections (the ones on), under the name given */
    fromList(name: string, list: Pick<Setlist, 'parts'>): Promise<Template> {
        return this.create(name, list.parts);
    }

    /** A copy of a template, as "Copia de …" */
    duplicate(id: string): Promise<Template> {
        return this.serial(async () => {
            const source = await this.get(id);
            if (source === undefined) {
                throw new ValidationError('La plantilla ya no existe.');
            }
            if ((await this.list()).length >= LIMITS.templates) {
                throw new ValidationError(`Se admiten hasta ${LIMITS.templates} plantillas.`);
            }
            const copy: Template = { id: this.newId(), name: copyName(source.name), parts: source.parts, updatedAt: this.now(), deletedAt: null };
            await this.store.save('templates', copy);
            this.afterWrite();

            return copy;
        });
    }

    rename(id: string, name: string): Promise<Template> {
        return this.edit(id, () => ({ name: cleanName(name) }));
    }

    /** Adds a section at the end (see `addedTo`) */
    addPart(id: string, name: string, section?: PartDef): Promise<Template> {
        return this.edit(id, (template) => ({ parts: cleanParts(addedTo(template.parts, name, () => this.newId(), section), []) }));
    }

    renamePart(id: string, part: string, name: string): Promise<Template> {
        return this.edit(id, (template) => ({ parts: cleanParts(renamedIn(template.parts, part, name), []) }));
    }

    movePart(id: string, part: string, direction: -1 | 1): Promise<Template> {
        return this.edit(id, (template) => ({ parts: cleanParts(movedIn(template.parts, part, direction), []) }));
    }

    /** Deletes a section; a template keeps at least one */
    removePart(id: string, part: string): Promise<Template> {
        return this.edit(id, (template) => ({ parts: cleanParts(withoutPart(template.parts, part), []) }));
    }

    /** Deletes the template; the deletion syncs like any edit. Lists made from it are not touched */
    remove(id: string): Promise<void> {
        return this.serial(async () => {
            const current = await this.store.get('templates', id);
            if (current === undefined || current.deletedAt !== null) {
                return;
            }
            const at = Math.max(this.now(), current.updatedAt + 1);
            await this.store.save('templates', { ...current, updatedAt: at, deletedAt: at });
            this.afterWrite();
        });
    }

    private edit(id: string, change: (template: Template) => Partial<Template>): Promise<Template> {
        return this.serial(async () => {
            const current = await this.get(id);
            if (current === undefined) {
                throw new ValidationError('La plantilla ya no existe.');
            }
            const next: Template = { ...current, ...change(current), updatedAt: Math.max(this.now(), current.updatedAt + 1) };
            await this.store.save('templates', next);
            this.afterWrite();

            return next;
        });
    }

    private serial<T>(work: () => Promise<T>): Promise<T> {
        const run = this.tail.then(work);
        this.tail = run.catch(() => undefined);

        return run;
    }
}

function cleanName(name: string): string {
    const clean = name.trim();
    if (clean === '') {
        throw new ValidationError('La plantilla necesita un nombre.');
    }
    if (Array.from(clean).length > LIMITS.templateName) {
        throw new ValidationError(`El nombre es demasiado largo (máximo ${LIMITS.templateName} caracteres).`);
    }

    return clean;
}
