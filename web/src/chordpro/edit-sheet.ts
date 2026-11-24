/**
 * The editor's preview: the same lyrics, drawn by `sheetHtml` like everywhere else, only cut at every syllable so each one can
 * be touched to put a chord on it (`places.ts`). Every syllable has a slot for its chord (empty where it has none), which is
 * what lets a plain line, with no chord at all, be touched too.
 *
 * What is read, sung and printed is not drawn from here: only the editor's preview is, and the golden fixtures stay the site's.
 */
import { parse, type Sheet } from './parser.ts';
import { sheetHtml } from './sheet.ts';
import { linesOf, type Piece } from './places.ts';

export interface EditSheet {
    html: string;
    /** In the order `sheetHtml` draws their `.seg`: the n-th piece is the n-th `.seg` of the HTML */
    pieces: Piece[];
}

export function editSheet(source: string, parsed: Sheet = parse(source)): EditSheet {
    const lines = linesOf(source);
    const pieces: Piece[] = [];
    let next = 0;
    const sections = parsed.sections.map((section) => ({
        ...section,
        lines: section.lines.map((line) => {
            if (typeof line === 'string') {
                return line;
            }
            const found = lines[next++];
            if (found === undefined) {
                return line;
            }
            pieces.push(...found.pieces);

            // "" is a chord of no name: the slot of a syllable that has none, drawn like any other
            return found.pieces.map((piece, position) => ({
                chord: piece.chord ?? '',
                text: piece.text,
                ...(position === found.pieces.length - 1 && found.note !== null ? { note: found.note } : {}),
            }));
        }),
    }));

    return { html: sheetHtml({ sections }), pieces };
}

/**
 * Names each `.seg` of the preview by its place, so a touch tells which one it was. It checks first that the drawing and the pieces
 * are the same thing (as many, with the same chords): if they ever were not, nothing is named and no chord is written in a
 * wrong place; returns whether it did.
 */
export function markPlaces(root: HTMLElement, pieces: readonly Piece[]): boolean {
    const segs = [...root.querySelectorAll<HTMLElement>('.seg')];
    const same = segs.length === pieces.length
        && segs.every((seg, position) => seg.querySelector('.ch')?.getAttribute('data-chord') === (pieces[position]?.chord ?? ''));
    if (!same) {
        return false;
    }
    segs.forEach((seg, position) => {
        const piece = pieces[position];
        if (piece?.place === true) {
            seg.dataset['place'] = piece.id;
            seg.classList.toggle('seg--free', piece.chord === null);
        }
    });

    return true;
}
