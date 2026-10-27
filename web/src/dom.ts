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
