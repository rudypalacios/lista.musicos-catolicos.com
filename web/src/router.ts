/**
 * Paths of the app. The server answers any path that is not /api with the app shell, and the
 * service worker does the same offline, so these are real URLs that survive a reload.
 */
export type Route =
    | { name: 'list' }
    | { name: 'new' }
    | { name: 'import' }
    | { name: 'view'; id: string }
    | { name: 'edit'; id: string }
    | { name: 'not-found' };

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\\w-]{1,64})';

export function matchRoute(path: string): Route {
    const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
    if (clean === '/' || clean === '/cantos' || clean === '') {
        return { name: 'list' };
    }
    if (clean === '/cantos/nuevo') {
        return { name: 'new' };
    }
    if (clean === '/cantos/importar') {
        return { name: 'import' };
    }
    const view = new RegExp(`^/cantos/${ID}$`).exec(clean);
    if (view?.[1] !== undefined) {
        return { name: 'view', id: view[1] };
    }
    const edit = new RegExp(`^/cantos/${ID}/editar$`).exec(clean);
    if (edit?.[1] !== undefined) {
        return { name: 'edit', id: edit[1] };
    }

    return { name: 'not-found' };
}

export const paths = {
    list: (): string => '/',
    new: (): string => '/cantos/nuevo',
    import: (): string => '/cantos/importar',
    view: (id: string): string => `/cantos/${id}`,
    edit: (id: string): string => `/cantos/${id}/editar`,
};
