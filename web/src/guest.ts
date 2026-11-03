/**
 * Trying the app with no account. The songs, lists and templates are written to the device like anyone's and wait in
 * the queue of what the server does not have; nothing is sent because there is nobody to send it to. When the person
 * signs in, that work is either added to the account or dropped (the dialog asks). Pure, so it is tested without a screen.
 */

/**
 * What a device whose person has no account is "owned" by. Not an email (it has no "@"), so it can never be an account's,
 * and the device's own store needs no new field to remember it.
 */
export const GUEST_OWNER = 'guest';

/** Whether the owner a device remembers is the "no account" one */
export function isGuest(owner: string | null): boolean {
    return owner === GUEST_OWNER;
}

/** What a person wrote with no account: the things that would be lost if the device were dropped */
export interface GuestWork {
    songs: number;
    lists: number;
    /** The templates the person made or changed: the Mass every device makes for itself is not work */
    templates: number;
}

/** Whether there is anything to ask about when the person signs in */
export function hasGuestWork(work: GuestWork): boolean {
    return work.songs + work.lists + work.templates > 0;
}

/** "12 cantos y 2 listados": what the dialog says is on the device; "" when there is nothing */
export function describeGuestWork(work: GuestWork): string {
    const parts = [
        count(work.songs, 'canto', 'cantos'),
        count(work.lists, 'listado', 'listados'),
        count(work.templates, 'plantilla', 'plantillas'),
    ].filter((part) => part !== '');
    if (parts.length <= 1) {
        return parts.join('');
    }

    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1] ?? ''}`;
}

function count(n: number, one: string, many: string): string {
    if (n === 0) {
        return '';
    }

    return n === 1 ? `1 ${one}` : `${n} ${many}`;
}
