import type { App } from '../app.ts';
import { visibleParts } from '../data/setlists.ts';
import type { Route } from '../router.ts';
import { addView } from '../views/add.ts';
import { editView } from '../views/edit.ts';
import { importView } from '../views/import.ts';
import { installView } from '../views/install.ts';
import { listView } from '../views/list.ts';
import { listsView } from '../views/lists.ts';
import { performView } from '../views/perform.ts';
import { sectionsView } from '../views/sections.ts';
import { setlistView } from '../views/setlist.ts';
import { settingsView } from '../views/settings.ts';
import { templateView } from '../views/template.ts';
import { templatesView } from '../views/templates.ts';
import type { Account, Navigate, View } from '../views/types.ts';
import { viewView } from '../views/view.ts';
import { notice } from './screen.ts';

/** Which screen an address is: what is read (a song, a list) is looked up first, so a missing one says so and does not draw empty */
export function routeView(data: App, route: Route, navigate: Navigate, account: Account): Promise<View> {
    switch (route.name) {
        case 'lists':
            return Promise.resolve(listsView(data, navigate));
        case 'setlist':
        case 'sections':
        case 'add':
        case 'perform':
            return data.setlists.get(route.id).then((setlist) => {
                if (setlist === undefined) {
                    return notice('Este listado no existe (o se eliminó).');
                }
                if (route.name === 'setlist') {
                    return setlistView(data, navigate, setlist);
                }
                if (route.name === 'sections') {
                    return sectionsView(data, navigate, setlist);
                }
                if (route.name === 'perform') {
                    return performView(data, navigate, setlist, route.n);
                }
                const part = visibleParts(setlist).find((candidate) => candidate.id === route.part);

                return part === undefined ? notice('Esta sección no existe en el listado.') : addView(data, navigate, setlist, part);
            });
        case 'templates':
            return Promise.resolve(templatesView(data, navigate));
        case 'template':
            return data.templates.get(route.id).then((template) =>
                template === undefined ? notice('Esta plantilla no existe (o se eliminó).') : templateView(data, navigate, template));
        case 'install':
            return Promise.resolve(installView());
        case 'settings':
            return Promise.resolve(settingsView(account));
        case 'list':
            return Promise.resolve(listView(data, navigate));
        case 'new':
            return Promise.resolve(editView(data, navigate, undefined, route));
        case 'import':
            return Promise.resolve(importView(data, navigate));
        case 'view':
        case 'edit':
            return data.get(route.id).then((song) => {
                if (song === undefined) {
                    return notice('Este canto no existe (o se eliminó).');
                }

                return route.name === 'view' ? viewView(data, navigate, song) : editView(data, navigate, song, route.back === undefined ? {} : { back: route.back });
            });
        default:
            return Promise.resolve(notice('Esta página no existe.'));
    }
}

