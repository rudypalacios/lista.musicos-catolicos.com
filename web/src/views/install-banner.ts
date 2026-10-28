import { currentInstallOffer, dismissInstallOffer, onInstallChange, promptInstall } from '../install.ts';
import { h, link } from '../dom.ts';
import { paths } from '../router.ts';

export interface InstallBanner {
    element: HTMLElement;
    /** Puts it away on screens that need every pixel (singing), whatever the offer */
    setAway: (away: boolean) => void;
}

/**
 * A slim bar at the bottom of the app, on every visit until the app is installed: a button that opens
 * the browser's own install dialog where there is one (Chrome), the steps where there is not (Safari
 * on iPad and iPhone). The browser decides whether and when its dialog can open, so the bar only
 * offers it when it has it; "Ahora no" puts it away for this visit only, and the next visit offers
 * again. It is not there once the app is installed or opened from the home screen.
 */
export function createInstallBanner(): InstallBanner {
    const text = h('p', {});
    const install = h('button', { type: 'button', class: 'button button--primary' }, 'Instalar');
    const steps = link(paths.install(), 'Cómo instalar', 'button button--primary');
    const later = h('button', { type: 'button', class: 'button' }, 'Ahora no');
    const element = h('div', { class: 'install-banner', role: 'region', 'aria-label': 'Instalar la app' }, text, install, steps, later);
    let away = false;

    const draw = (): void => {
        const offer = currentInstallOffer();
        element.hidden = away || offer === 'none';
        install.hidden = offer !== 'prompt';
        steps.hidden = offer !== 'steps';
        text.textContent = offer === 'steps'
            ? 'Para abrir Lista como una app, a pantalla completa y sin conexión, añádela a la pantalla de inicio.'
            : 'Instala Lista en este aparato: abre más rápido, a pantalla completa y sin conexión.';
    };
    install.addEventListener('click', () => {
        // Chrome shows its dialog; whatever the person picks, the offer is settled for this visit
        void promptInstall();
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
