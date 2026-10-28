/**
 * Where the app is running, to know whether to suggest putting it on the home screen. Only iPad and
 * iPhone browsers get the suggestion: there the installed app is the one Safari keeps its data for
 * (Safari clears what a site stored when it has not been visited for 7 days, and an installed app is
 * not a site visit that can lapse). Chrome (Android, and desktop Edge/Chrome) hands the page an install
 * prompt to show when it chooses; Safari has none, so there the person is told the steps.
 */
export type InstallContext = 'ios-browser' | 'installed' | 'other';

export interface Environment {
    userAgent: string;
    platform: string;
    maxTouchPoints: number;
    /** Opened from the home screen: `navigator.standalone` (Safari) or the standalone display mode */
    standalone: boolean;
}

export function installContext(env: Environment): InstallContext {
    if (env.standalone) {
        return 'installed';
    }
    // An iPad asks for the desktop site by default: it says "MacIntel" but has a touch screen
    const ios = /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);

    return ios ? 'ios-browser' : 'other';
}

export function detectInstall(): InstallContext {
    const standalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true
        || window.matchMedia('(display-mode: standalone)').matches;

    return installContext({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone,
    });
}

/** What Chrome hands over when the app can be installed: calling `prompt()` shows its own dialog */
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * What to offer on this visit: Chrome's own install dialog (a button that opens it), the steps for
 * Safari (which has no dialog to open), or nothing (already installed, a browser that cannot, or the
 * person said "Ahora no" on this visit).
 */
export type InstallOffer = 'prompt' | 'steps' | 'none';

export function installOffer(context: InstallContext, hasPrompt: boolean, dismissed: boolean): InstallOffer {
    if (context === 'installed' || dismissed) {
        return 'none';
    }
    if (hasPrompt) {
        return 'prompt';
    }

    return context === 'ios-browser' ? 'steps' : 'none';
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let dismissedThisVisit = false;
const listeners = new Set<() => void>();

const notify = (): void => listeners.forEach((listener) => listener());

/**
 * Starts listening for Chrome's install prompt. Call it as early as the page can: the event comes
 * once, soon after load, and is lost to anyone who is not yet listening. The browser's own mini
 * install bar is held back, so the offer is the app's (one place, always the same words).
 */
export function watchInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferred = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        installedNow = true;
        deferred = null;
        notify();
    });
}

/** What to offer right now */
export function currentInstallOffer(): InstallOffer {
    return installOffer(installedNow ? 'installed' : detectInstall(), deferred !== null, dismissedThisVisit);
}

/** Calls `listener` whenever the offer may have changed; returns how to stop */
export function onInstallChange(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** "Ahora no": nothing more on this visit; the next one asks again */
export function dismissInstallOffer(): void {
    dismissedThisVisit = true;
    notify();
}

/**
 * Opens Chrome's install dialog (it needs the person's tap, so this is called from a click).
 * The prompt can be used once: after it, the offer is gone for this visit whatever was chosen.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const prompt = deferred;
    if (prompt === null) {
        return 'unavailable';
    }
    deferred = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
        installedNow = true;
    } else {
        dismissedThisVisit = true;
    }
    notify();

    return outcome;
}

/**
 * Putting Lista on the home screen from Safari, the way the install bar tells it. It lives here, in
 * the bar, and not only in the guide: the guide is a screen of the app, which sits behind the sign-in,
 * and the people who need these steps are the ones who have not installed or signed in yet.
 */
export const HOME_SCREEN_STEPS: readonly string[] = [
    'Toca el botón Compartir (el cuadrado con una flecha hacia arriba).',
    'Elige «Añadir a pantalla de inicio» y toca «Añadir».',
    'Abre Lista desde su ícono, no desde el navegador.',
];
