import type { App } from '../app.ts';
import { askToLeave, leaveIsRisky, setLeaveGuard } from '../leave-guard.ts';
import { matchRoute } from '../router.ts';
import { dismissSheetOnBack } from '../views/sheet.ts';
import type { Navigate } from '../views/types.ts';
import type { Frame } from './frame.ts';
import { routeView } from './routes.ts';
import type { Screen } from './screen.ts';

/** Puts the screen back where it was, waiting for a view that fills in after it is shown */
function restoreScroll(top: number): void {
    const container = document.getElementById('view');
    if (container === null || top <= 0) {
        return;
    }
    let tries = 0;
    const apply = (): void => {
        container.scrollTop = top;
        if (container.scrollTop < top && ++tries < 8) {
            setTimeout(apply, 100);
        }
    };
    apply();
}

/**
 * The browser's address bar and back button, drawn as screens: shows the screen the address asks for, keeps how far each
 * one was scrolled so "back" returns to the same place, and asks before leaving a screen with something unsaved. Called
 * once (it listens to the page); it returns what draws the current screen again, for when the frame was built anew.
 */
export function runNavigation(data: App, screen: Screen, frame: Frame): () => void {
    let token = 0;
    /** How far each screen was scrolled when the person left it, so "back" returns to the same place */
    const scrolls = new Map<string, number>();
    /** The address of the screen being shown */
    let shown = location.pathname;
    const rememberScroll = (): void => {
        const container = document.getElementById('view');
        if (container !== null) {
            scrolls.set(shown, container.scrollTop);
        }
    };
    const render = (restore: boolean): void => {
        const mine = ++token;
        const route = matchRoute(location.pathname, location.search);
        const path = location.pathname;
        frame.markSection(route);
        void routeView(data, route, navigate, frame.account()).then((view) => {
            if (mine === token) {
                screen.show(view);
                shown = path;
                if (restore) {
                    restoreScroll(scrolls.get(path) ?? 0);
                }
            } else {
                view.dispose?.();
            }
        });
    };
    const navigate: Navigate = (path, options) => {
        rememberScroll();
        if (options?.replace === true) {
            history.replaceState(null, '', path);
        } else {
            history.pushState(null, '', path);
        }
        render(false);
    };

    document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }
        const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-link]');
        if (anchor !== null && anchor.origin === location.origin) {
            event.preventDefault();
            const path = anchor.pathname + anchor.search;
            if (leaveIsRisky()) {
                void askToLeave().then((leave) => leave && navigate(path));
            } else {
                navigate(path);
            }
        }
    });
    window.addEventListener('popstate', () => {
        if (dismissSheetOnBack()) {
            return;
        }
        if (leaveIsRisky()) {
            // The address has already changed: put it back, ask, and only if the person leaves go back for real
            history.pushState(null, '', shown);
            void askToLeave().then((leave) => {
                if (leave) {
                    setLeaveGuard(null);
                    history.back();
                }
            });

            return;
        }
        rememberScroll();
        render(true);
    });
    render(false);

    return () => window.dispatchEvent(new PopStateEvent('popstate'));
}
