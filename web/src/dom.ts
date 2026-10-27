/**
 * Tiny element builder. Text always goes in as text (never as HTML), so nothing a user or
 * the server sends can inject markup.
 */
type Child = Node | string;

export function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<Record<string, string | boolean>> = {},
    ...children: Child[]
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(props)) {
        if (value === false) {
            continue;
        }
        element.setAttribute(name, value === true ? '' : String(value));
    }
    element.append(...children);

    return element;
}

/** An in-app link: the router handles the click (data-link), the href still works in a new tab */
export function link(href: string, text: string, className = ''): HTMLAnchorElement {
    return h('a', { href, 'data-link': true, ...(className !== '' ? { class: className } : {}) }, text);
}

/** HTML made by sheet.ts, where every piece of text was escaped (ChordSheet's contract) */
export function setSheet(target: HTMLElement, html: string): void {
    target.innerHTML = html;
}
