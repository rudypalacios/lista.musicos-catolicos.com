import type { SetlistItem } from './types.ts';

/**
 * The pages singing is read in. Each song is a page of its own, except a pair the person divided: the first of the two
 * carries `withNext`, the id of the song that follows it, and the two share one page (two squares on a screen).
 *
 * Pure, so it is the same for the screen of a phone, a tablet and the visitor of a shared link. The pair is read
 * left to right and only counts while the two are neighbours in the order of the list: if one of them was moved or
 * removed the union is ignored (never broken), and it counts again if they end up side by side.
 */
export function pagesOf<T extends Pick<SetlistItem, 'id' | 'withNext'>>(order: readonly T[]): T[][] {
    const pages: T[][] = [];
    for (let index = 0; index < order.length; index++) {
        const item = order[index] as T;
        const next = order[index + 1];
        if (item.withNext !== undefined && next !== undefined && item.withNext === next.id) {
            pages.push([item, next]);
            index++;
        } else {
            pages.push([item]);
        }
    }

    return pages;
}

/** The page (its index) a song is on, or -1 when it is not in the order */
export function pageIndexOf(pages: readonly (readonly Pick<SetlistItem, 'id'>[])[], itemId: string): number {
    return pages.findIndex((page) => page.some((item) => item.id === itemId));
}

/** Whether the page of this song can be divided with the next one: `ok`, or the reason, in the words the person reads */
export type JoinCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether a song that is alone on its page can share it with the song that follows. A pair is never joined again (it is
 * separated); the last song has no next one, and the next one may already be the first of another pair.
 */
export function canJoin<T extends Pick<SetlistItem, 'id' | 'withNext'>>(order: readonly T[], itemId: string): JoinCheck {
    const index = order.findIndex((item) => item.id === itemId);
    if (index < 0) {
        return { ok: false, reason: 'El canto ya no está en el listado.' };
    }
    const pages = pagesOf(order);
    const page = pages[pageIndexOf(pages, itemId)] ?? [];
    if (page.length === 2) {
        return { ok: false, reason: 'Estos dos cantos ya están unidos.' };
    }
    const next = order[index + 1];
    if (next === undefined) {
        return { ok: false, reason: 'Es el último canto: no hay uno siguiente para unir.' };
    }
    const nextPage = pages[pageIndexOf(pages, next.id)] ?? [];
    if (nextPage.length === 2) {
        return { ok: false, reason: 'El canto siguiente ya está unido con otro.' };
    }

    return { ok: true };
}

/** How a page of two is laid out: side by side on a screen wider than tall, one over the other on the rest (set by the device, never saved) */
export function squaresLayout(width: number, height: number): 'row' | 'column' {
    return width > height ? 'row' : 'column';
}

/** "2/10" for a song alone, "2–3/10" for a pair; the numbers are the songs', counted in the order of the list */
export function positionText<T extends Pick<SetlistItem, 'id'>>(order: readonly T[], page: readonly T[]): string {
    const numbers = page.map((item) => order.findIndex((candidate) => candidate.id === item.id) + 1);

    return `${numbers.join('–')}/${order.length}`;
}
