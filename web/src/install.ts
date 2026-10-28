/**
 * Where the app is running, to know whether to suggest putting it on the home screen. Only iPad and
 * iPhone browsers get the suggestion: there the installed app is the one Safari keeps its data for
 * (Safari clears what a site stored when it has not been visited for 7 days, and an installed app is
 * not a site visit that can lapse). Android's Chrome offers to install by itself.
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
