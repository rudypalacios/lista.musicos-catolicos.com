/**
 * The icons of the app: a few shapes drawn here on the same grid as the public site's own (24×24,
 * 2px stroke, round ends, `currentColor`), so a button takes its colour from its text and nothing
 * is loaded from another domain. Simple Icons is only for brand logos and has none of these.
 */
const NS = 'http://www.w3.org/2000/svg';

type Shape = readonly [tag: 'path' | 'circle' | 'rect', attributes: Readonly<Record<string, string>>];

interface Drawing {
    /** Filled shapes (the star that is on, a play triangle, dots) instead of a line drawing */
    readonly filled?: true;
    readonly shapes: readonly Shape[];
}

const STAR = 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z';

const DRAWINGS = {
    more: { filled: true, shapes: [['circle', { cx: '5', cy: '12', r: '1.8' }], ['circle', { cx: '12', cy: '12', r: '1.8' }], ['circle', { cx: '19', cy: '12', r: '1.8' }]] },
    play: { filled: true, shapes: [['path', { d: 'M7 4l14 8-14 8z' }]] },
    pencil: { shapes: [['path', { d: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z' }], ['path', { d: 'M14 6l4 4' }]] },
    plus: { shapes: [['path', { d: 'M12 5v14M5 12h14' }]] },
    'arrow-up': { shapes: [['path', { d: 'M12 19V5M5 12l7-7 7 7' }]] },
    'arrow-down': { shapes: [['path', { d: 'M12 5v14M5 12l7 7 7-7' }]] },
    x: { shapes: [['path', { d: 'M6 6l12 12M18 6L6 18' }]] },
    trash: { shapes: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }]] },
    printer: { shapes: [['path', { d: 'M6 9V3h12v6M6 18H4v-7h16v7h-2' }], ['rect', { x: '6', y: '14', width: '12', height: '7' }]] },
    info: { shapes: [['circle', { cx: '12', cy: '12', r: '9' }], ['path', { d: 'M12 11v5M12 8h.01' }]] },
    music: { shapes: [['path', { d: 'M9 18V5l11-2v13' }], ['circle', { cx: '6', cy: '18', r: '3' }], ['circle', { cx: '17', cy: '16', r: '3' }]] },
    list: { shapes: [['path', { d: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' }]] },
    settings: { shapes: [['circle', { cx: '12', cy: '12', r: '3' }], ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' }]] },
    star: { shapes: [['path', { d: STAR }]] },
    'star-filled': { filled: true, shapes: [['path', { d: STAR }]] },
} as const satisfies Record<string, Drawing>;

export type IconName = keyof typeof DRAWINGS;

/** An icon for a button that has its own text or `aria-label`: it is hidden from screen readers */
export function icon(name: IconName, size = 20): SVGSVGElement {
    const drawing: Drawing = DRAWINGS[name];
    const svg = document.createElementNS(NS, 'svg');
    const attributes: Record<string, string> = {
        width: String(size), height: String(size), viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
        class: 'icon',
        ...(drawing.filled === true
            ? { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1', 'stroke-linejoin': 'round' }
            : { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    };
    for (const [key, value] of Object.entries(attributes)) {
        svg.setAttribute(key, value);
    }
    for (const [tag, shape] of drawing.shapes) {
        const element = document.createElementNS(NS, tag);
        for (const [key, value] of Object.entries(shape)) {
            element.setAttribute(key, value);
        }
        svg.append(element);
    }

    return svg;
}
