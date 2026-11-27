import { h } from '../dom.ts';
import { paths } from '../router.ts';

/**
 * The one line about privacy the screens where a person gets in carry: a link to the page that says it all. It opens apart, so
 * a form that was being filled is not lost.
 */
export function privacyLine(): HTMLElement {
    return h('p', { class: 'gate__privacy' }, h('a', { href: paths.privacy(), target: '_blank', rel: 'noopener' }, 'Lee la privacidad'));
}

/** A thin rule with a word in the middle ("o", "o con tu correo"), to tell two ways of doing the same thing apart */
export function orDivider(text: string): HTMLElement {
    return h('p', { class: 'gate__or', 'aria-hidden': 'true' }, text);
}
