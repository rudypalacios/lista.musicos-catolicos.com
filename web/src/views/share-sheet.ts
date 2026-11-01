import { ApiError, share } from '../api.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import { shareFailure, shareSummary, shareUrl, type ShareState } from '../share.ts';
import { showToast } from '../toast.ts';
import { confirmDialog } from './confirm-dialog.ts';
import { createSheet, sheetAction } from './sheet.ts';

/** The list a share is for: only what the sheet names */
export interface SharedTarget {
    id: string;
    title: string;
}

export interface ShareSheet {
    /** Put it inside the screen it covers (it is a sheet over the window) */
    element: HTMLElement;
    /** Opens it for this list: asks the server whether it is shared and shows what can be done */
    open: (list: SharedTarget) => void;
    release: () => void;
}

/** Copies a text; a browser that refuses (no permission, an old one) is told so, so the person can select it by hand */
async function copy(text: string, field: HTMLElement): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);

        return true;
    } catch {
        const range = document.createRange();
        range.selectNodeContents(field);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);

        return false;
    }
}

/**
 * "Compartir listado": anyone with the link can read the list, with no account, and nothing else. Before it is shared
 * the person chooses whether the lyrics and chords go with it and creates the link; once shared the sheet has the link
 * (to copy, or to hand over through the phone's own sharing), the same choice (which applies at once) and, last, the
 * way to stop sharing, which kills the link for good. Sharing is a thing the server does, so it needs a connection.
 */
export function createShareSheet(): ShareSheet {
    const sheet = createSheet('Compartir listado');
    sheet.element.classList.add('sheet-layer--window');
    let target: SharedTarget | null = null;
    /** What the person chose before creating the link; once shared the server's answer is the truth */
    let withLyrics = true;

    const title = (sub: string): HTMLElement[] => [
        h('h4', { class: 'sheet__title' }, 'Compartir listado'),
        h('p', { class: 'sheet__sub' }, sub),
    ];

    const lyricsSwitch = (on: boolean, change: (next: boolean) => void): HTMLElement => {
        const button = h('button', { type: 'button', class: 'share__switch', role: 'switch', 'aria-checked': String(on) },
            h('span', { class: 'share__switch-text' }, h('b', {}, 'Incluir letra y acordes'),
                h('small', {}, on ? 'Quien abra el enlace los verá.' : 'Solo el orden, los títulos y los autores.')),
            h('span', { class: on ? 'switch is-on' : 'switch', 'aria-hidden': 'true' }));
        button.addEventListener('click', () => change(!on));

        return button;
    };

    const rights = (): HTMLElement => h('p', { class: 'share__notice' }, icon('info', 18),
        h('span', {}, 'Las letras y los acordes pertenecen a sus autores. El enlace dice que es para uso personal. Compártelo solo si tienes permiso.'));

    const say = (text: string): void => {
        sheet.body.replaceChildren(...title(target?.title ?? ''), h('p', { class: 'share__wait', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text));
    };

    const failed = (failure: unknown, retry: () => void): void => {
        const message = shareFailure(failure instanceof ApiError ? failure : null);
        const again = h('button', { type: 'button', class: 'button' }, 'Reintentar');
        again.addEventListener('click', retry);
        sheet.body.replaceChildren(...title(target?.title ?? ''), h('p', { class: 'error', role: 'alert' }, message), h('div', { class: 'actions' }, again));
    };

    const draw = (state: ShareState): void => {
        const list = target;
        if (list === null) {
            return;
        }
        if (state.shared !== true || state.code === undefined) {
            drawOff(list);

            return;
        }
        const code = state.code;
        const on = state.withLyrics === true;
        const url = shareUrl(location.origin, code);
        const field = h('span', { class: 'share__url' }, url);
        const copyButton = h('button', { type: 'button', class: 'button share__copy' }, icon('copy', 18), 'Copiar');
        copyButton.addEventListener('click', () => {
            void copy(url, field).then((done) => showToast(done ? 'Enlace copiado' : 'Selecciona el enlace y cópialo', 3000, true));
        });
        const handOver = typeof navigator.share === 'function'
            ? h('button', { type: 'button', class: 'button button--primary share__hand' }, icon('share', 18), 'Compartir…')
            : null;
        handOver?.addEventListener('click', () => {
            // A person who closes the phone's own sheet is not a failure
            void navigator.share({ title: list.title, url }).catch(() => undefined);
        });

        sheet.body.replaceChildren(
            ...title(list.title),
            h('p', { class: 'share__state' }, h('i', { 'aria-hidden': 'true' }), shareSummary(on)),
            h('div', { class: 'share__link' }, field, copyButton),
            ...(handOver === null ? [] : [handOver]),
            lyricsSwitch(on, (next) => {
                say('Guardando…');
                share.enable(list.id, next).then(draw).catch((failure: unknown) => failed(failure, () => void load()));
            }),
            sheetAction('link', 'Dejar de compartir', () => {
                void confirmDialog({
                    title: '¿Dejar de compartir?',
                    text: 'El enlace dejará de funcionar para todos los que lo tengan. Si compartes el listado otra vez, el enlace será otro.',
                    confirm: 'Dejar de compartir',
                    danger: true,
                }).then((sure) => {
                    if (!sure) {
                        return;
                    }
                    say('Dejando de compartir…');
                    share.stop(list.id)
                        .then(() => {
                            showToast('Ya no se comparte', 3000, true);
                            sheet.close();
                        })
                        .catch((failure: unknown) => failed(failure, () => void load()));
                });
            }, { danger: true, apart: true }),
        );
    };

    const drawOff = (list: SharedTarget): void => {
        const create = h('button', { type: 'button', class: 'button button--primary share__create' }, icon('link', 18), 'Crear enlace');
        create.addEventListener('click', () => {
            say('Creando el enlace…');
            share.enable(list.id, withLyrics).then(draw).catch((failure: unknown) => failed(failure, () => void load()));
        });
        const cancel = h('button', { type: 'button', class: 'button' }, 'Cancelar');
        cancel.addEventListener('click', () => sheet.close());
        sheet.body.replaceChildren(
            ...title('Cualquiera con el enlace podrá ver este listado, sin cuenta y solo para leer.'),
            lyricsSwitch(withLyrics, (next) => {
                withLyrics = next;
                drawOff(list);
            }),
            rights(),
            h('div', { class: 'actions' }, create, cancel),
        );
    };

    const load = async (): Promise<void> => {
        const list = target;
        if (list === null) {
            return;
        }
        say('Comprobando…');
        try {
            draw(await share.status(list.id));
        } catch (failure) {
            failed(failure, () => void load());
        }
    };

    return {
        element: sheet.element,
        open: (list) => {
            target = list;
            withLyrics = true;
            sheet.open();
            void load();
        },
        release: () => sheet.release(),
    };
}
