import { currentInstallOffer, dismissInstallOffer, HOME_SCREEN_STEPS, onInstallChange, promptInstall } from '../install.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';

export interface InstallBanner {
    element: HTMLElement;
    /** Puts it away on screens that need every pixel (singing), whatever the offer */
    setAway: (away: boolean) => void;
}

/**
 * A slim, quiet bar at the bottom of the app (one line, muted, easy to dismiss), on every visit until the app is installed: a button that opens
 * the browser's own install dialog where there is one (Chrome), the steps where there is not (Safari
 * on iPad and iPhone), written out right there so they work before signing in and offline. The browser decides whether and when its dialog can open, so the bar only
 * offers it when it has it; "Ahora no" puts it away for this visit only, and the next visit offers
 * again. It is not there once the app is installed or opened from the home screen.
 */
export function createInstallBanner(): InstallBanner {
    const text = h('p', {});
    const install = h('button', { type: 'button', class: 'install-banner__action' }, 'Instalar');
    const how = h('button', { type: 'button', class: 'install-banner__action', 'aria-label': 'Cómo instalar', 'aria-expanded': 'false' }, 'Cómo');
    const steps = h('ol', { class: 'install-banner__steps' }, ...HOME_SCREEN_STEPS.map((step) => h('li', {}, step)));
    steps.hidden = true;
    const later = h('button', { type: 'button', class: 'install-banner__close', 'aria-label': 'Ahora no' }, icon('x', 18));
    const element = h('div', { class: 'install-banner', role: 'region', 'aria-label': 'Instalar la app' }, text, install, how, later, steps);
    let away = false;

    const draw = (): void => {
        const offer = currentInstallOffer();
        element.hidden = away || offer === 'none';
        install.hidden = offer !== 'prompt';
        how.hidden = offer !== 'steps';
        if (offer !== 'steps') {
            steps.hidden = true;
            how.setAttribute('aria-expanded', 'false');
        }
        text.textContent = offer === 'steps'
            ? 'Añade Lista a tu pantalla de inicio para abrirla como app.'
            : 'Instala Lista: se abre como app y sirve sin conexión.';
    };
    install.addEventListener('click', () => {
        // Chrome shows its dialog; whatever the person picks, the offer is settled for this visit
        void promptInstall();
    });
    how.addEventListener('click', () => {
        steps.hidden = !steps.hidden;
        how.setAttribute('aria-expanded', String(!steps.hidden));
    });
    later.addEventListener('click', dismissInstallOffer);
    onInstallChange(draw);
    draw();

    return {
        element,
        setAway: (value) => {
            away = value;
            draw();
        },
    };
}
