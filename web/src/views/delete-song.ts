import type { App } from '../app.ts';
import type { Setlist, Song } from '../data/types.ts';
import { showToast } from '../toast.ts';
import { confirmDialog } from './confirm-dialog.ts';

/** What the question says: a song that is in lists stays there as "Canto eliminado", so the lists are named first */
export function deleteSongText(lists: readonly Pick<Setlist, 'title'>[]): string {
    const base = 'Se borra el canto de todos tus dispositivos. No se puede deshacer.';
    if (lists.length === 0) {
        return base;
    }
    const names = lists.map((list) => `«${list.title}»`).join(', ');
    const where = lists.length === 1 ? `el listado ${names}` : `${lists.length} listados (${names})`;

    return `${base} Está en ${where}: ahí aparecerá como «Canto eliminado» hasta que lo quites.`;
}

/**
 * Deleting a song, the same from the Cantos list and from the edit screen: ask first (naming the lists
 * it is in), then delete it and say so.
 *
 * @returns true when the song was deleted; false when the person answered "Cancelar". A failure rejects.
 */
export async function deleteSongAfterAsking(app: App, song: Pick<Song, 'id' | 'title'>): Promise<boolean> {
    const lists = await app.setlists.using(song.id);
    const confirmed = await confirmDialog({
        title: `¿Eliminar «${song.title}»?`,
        text: deleteSongText(lists),
        confirm: 'Eliminar',
        danger: true,
    });
    if (!confirmed) {
        return false;
    }
    await app.remove(song.id);
    showToast('Canto eliminado', 3000, true);

    return true;
}
