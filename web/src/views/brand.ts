import { h } from '../dom.ts';

const NS = 'http://www.w3.org/2000/svg';

/**
 * The mark of Músicos Católicos, drawn the way the public site draws it (`layout.twig`, `.site-brand`): a ring with a cross, a
 * 2-wide line on a 28 grid, in the accent colour (`.brand__mark`). It is drawn, not a character of a font, and it is the same
 * drawing the app's icons are made from (`web/brand/icon.svg`).
 */
export function brandMark(): SVGSVGElement {
    const svg = document.createElementNS(NS, 'svg');
    for (const [key, value] of Object.entries({
        viewBox: '0 0 28 28', fill: 'none', 'stroke-width': '2', 'aria-hidden': 'true', focusable: 'false', class: 'brand__mark',
    })) {
        svg.setAttribute(key, value);
    }
    const ring = document.createElementNS(NS, 'circle');
    for (const [key, value] of Object.entries({ cx: '14', cy: '14', r: '12' })) {
        ring.setAttribute(key, value);
    }
    const cross = document.createElementNS(NS, 'path');
    cross.setAttribute('d', 'M14 6.5v15M9.5 11h9');
    svg.append(ring, cross);

    return svg;
}

/** The mark above the name, both centred: how the welcome presents the app (the name is its heading) */
export function brandLockup(): HTMLElement {
    return h('header', { class: 'brand' }, brandMark(), h('h2', { class: 'brand__name' }, 'Músicos Católicos'));
}
