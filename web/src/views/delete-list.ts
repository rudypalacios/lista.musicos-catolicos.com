import type { App } from '../app.ts';
import type { Setlist } from '../data/types.ts';
import { showToast } from '../toast.ts';
import { confirmDialog } from './confirm-dialog.ts';

/**
 * Deleting a list, the same from the lists screen and from inside a list: ask first (a list is
 * deleted on every device and cannot be brought back), then delete it and say so.
 *
 * @returns true when the list was deleted; false when the person answered "Cancelar". A failure rejects.
 */
export async function deleteListAfterAsking(app: App, list: Pick<Setlist, 'id' | 'title'>): Promise<boolean> {
    const confirmed = await confirmDialog({
        title: `¿Eliminar «${list.title}»?`,
        text: 'Se borra el listado de todos tus dispositivos. Los cantos no se borran. No se puede deshacer.',
        confirm: 'Eliminar',
        danger: true,
    });
    if (!confirmed) {
        return false;
    }
    await app.setlists.remove(list.id);
    showToast('Listado eliminado', 3000, true);

    return true;
}
