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
    | { name: 'lists' }
    | { name: 'setlist'; id: string }
    | { name: 'add'; id: string; part: string }
    | { name: 'perform'; id: string; n: number }
    | { name: 'install' }
    | { name: 'settings' }
    | { name: 'not-found' };

const ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\\w-]{1,64})';
/** The id of a part of the Mass (mass.ts): lower case, digits and hyphens */
const PART = '([a-z0-9-]{1,40})';

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

    if (clean === '/listados') {
        return { name: 'lists' };
    }
    const setlist = new RegExp(`^/listados/${ID}$`).exec(clean);
    if (setlist?.[1] !== undefined) {
        return { name: 'setlist', id: setlist[1] };
    }
    const add = new RegExp(`^/listados/${ID}/agregar/${PART}$`).exec(clean);
    if (add?.[1] !== undefined && add[2] !== undefined) {
        return { name: 'add', id: add[1], part: add[2] };
    }
    const perform = new RegExp(`^/listados/${ID}/cantar/(\\d{1,3})$`).exec(clean);
    if (perform?.[1] !== undefined && perform[2] !== undefined) {
        return { name: 'perform', id: perform[1], n: Number(perform[2]) };
    }

    if (clean === '/ayuda/instalar') {
        return { name: 'install' };
    }

    if (clean === '/ajustes') {
        return { name: 'settings' };
    }

    return { name: 'not-found' };
}

export const paths = {
    list: (): string => '/',
    new: (): string => '/cantos/nuevo',
    import: (): string => '/cantos/importar',
    view: (id: string): string => `/cantos/${id}`,
    edit: (id: string): string => `/cantos/${id}/editar`,
    lists: (): string => '/listados',
    setlist: (id: string): string => `/listados/${id}`,
    addToSetlist: (id: string, part: string): string => `/listados/${id}/agregar/${part}`,
    /** `n` counts from 1: the first song of the list in the order of the Mass */
    perform: (id: string, n: number): string => `/listados/${id}/cantar/${n}`,
    install: (): string => '/ayuda/instalar',
    settings: (): string => '/ajustes',
};

/** The entry of the menu a route belongs to (the screens that hang from one share its entry) */
export function sectionOf(route: Route): 'songs' | 'lists' | 'settings' {
    switch (route.name) {
        case 'lists':
        case 'setlist':
        case 'add':
        case 'perform':
            return 'lists';
        case 'settings':
        case 'install':
            return 'settings';
        default:
            return 'songs';
    }
}

/** What the bar says on a screen of the menu; the screens that hang from another say it with their way back */
export function titleOf(route: Route): string {
    switch (route.name) {
        case 'list':
            return 'Cantos';
        case 'lists':
            return 'Listados';
        case 'settings':
            return 'Ajustes';
        default:
            return 'Lista';
    }
}

/**
 * Where "back" goes from a screen that hangs from another one, and what the header calls it. The
 * screens of the menu (the two lists, Ajustes) have no parent: the bar shows their name there.
 * Singing has its own bar and no header, so it has no parent either.
 */
export function parentOf(route: Route): { path: string; label: string } | null {
    switch (route.name) {
        case 'view':
        case 'new':
        case 'import':
            return { path: paths.list(), label: 'Cantos' };
        case 'edit':
            return { path: paths.view(route.id), label: 'Canto' };
        case 'setlist':
            return { path: paths.lists(), label: 'Listados' };
        case 'add':
            return { path: paths.setlist(route.id), label: 'Volver al listado' };
        case 'install':
            return { path: paths.settings(), label: 'Ajustes' };
        default:
            return null;
    }
}
