import './styles.css';
import './sheet.css';
import { App } from './app.ts';
import { watchInstallPrompt } from './install.ts';
import { matchRoute } from './router.ts';
import { applyReadingColors } from './settings.ts';
import { createFrame } from './shell/frame.ts';
import { runNavigation } from './shell/navigation.ts';
import { createScreen } from './shell/screen.ts';
import { createSession } from './shell/session.ts';
import { showFatal, startUpdates } from './updates.ts';
import { screenKeeper } from './wakelock.ts';
import { createInstallBanner } from './views/install-banner.ts';
import { startResetPassword, startVerifyEmail } from './views/account-link.ts';
import { startShared } from './views/shared.ts';

/**
 * The entry point: picks what the page is (a visitor reading a shared list, or the app) and puts the parts together. The
 * parts are in `shell/`: the screen the views are shown in, the frame around them (bar, menu), the navigation that maps the
 * address to a view, and the session that decides who is in. Everything the person has is on this device first (IndexedDB)
 * and synced when the network allows, so the shell, the songs and the viewer all work with no connection.
 */

const root = document.getElementById('app');
if (root === null) {
    throw new Error('Missing #app');
}
const app: HTMLElement = root;

/** Builds the app around the device's data and starts it */
function startApp(data: App): Promise<void> {
    const screen = createScreen(app);
    /** The "install the app" bar at the bottom, one for the whole page, until the app is installed */
    const installBanner = createInstallBanner();
    const frame = createFrame(app, data, installBanner);
    /** What draws the current screen again; there from the first time the app is shown */
    let redraw: (() => void) | null = null;
    const showApp = (): void => {
        if (redraw === null) {
            redraw = runNavigation(data, screen, frame);
        } else {
            redraw();
        }
    };

    return createSession({ root: app, data, screen, frame, installBanner, showApp }).begin();
}

// Whatever goes wrong while starting, say so instead of leaving a blank screen
window.addEventListener('error', (event) => {
    if (document.querySelector('.bar') === null && document.querySelector('.pub') === null) {
        showFatal(app, event.error ?? event.message);
    }
});
window.addEventListener('unhandledrejection', (event) => {
    if (document.querySelector('.bar') === null && document.querySelector('.pub') === null) {
        showFatal(app, event.reason);
    }
});

const visiting = matchRoute(location.pathname);
if (visiting.name === 'shared') {
    // Somebody who was given a link to a list: no account, no data of this device and no sync.
    // The page reads the list from the server, keeps a copy of it apart and shows it (views/shared.ts)
    // It is still this app: the same service worker keeps it (and the list the visitor opened) for reading with no connection
    startUpdates(false);
    startShared(app, visiting.code);
} else if (visiting.name === 'verify' || visiting.name === 'reset') {
    // The link of an email: a page of its own that needs no session and no data of this device
    startUpdates(false);
    if (visiting.name === 'verify') {
        startVerifyEmail(app, visiting.token);
    } else {
        startResetPassword(app, visiting.token);
    }
} else {
    applyReadingColors();
    // Chrome's install prompt comes once, soon after load: be listening before anything else is built
    watchInstallPrompt();
    // The browser drops the screen lock whenever the page is hidden: ask again when it is back
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            screenKeeper.resume();
        }
    });
    startUpdates();
    void App.create(() => {
        // Another window still runs the old version and holds the data: say what to do, not just wait
        const waiting = document.querySelector('.splash p');
        if (waiting !== null) {
            waiting.textContent = 'Cierra las demás ventanas de la app para terminar de actualizarla…';
        }
    })
        .then((data) => {
            data.watchConnection();

            return startApp(data);
        })
        .catch((error: unknown) => showFatal(app, error));
}
