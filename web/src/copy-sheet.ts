/**
 * What copying a song from the screen puts on the clipboard: the chords on a line above the words, each over the syllable
 * it sits on, the way a sheet is written on paper. A selection of the page as it is drawn comes out as a chord name,
 * then a piece of the lyrics, then another chord…, one to a line: nothing that can be pasted back as a song. The same
 * text goes back into the editor as a song (`convertPastedSheet`) with every chord where it was.
 *
 * The text is laid out in a monospaced grid (a letter is a column), so it holds in any font a chat or a note uses
 * only when that font is monospaced: it is the shape the importer reads best, and the one a person lines up by hand.
 */

/** A piece of a line: a chord (as it is shown: Do, Sol…) over the words sung from it */
export interface CopiedSegment {
    chord: string | null;
    text: string;
}

/** A line of a song as copied: its pieces, and a note at its end ("x2") */
export interface CopiedLine {
    segments: readonly CopiedSegment[];
    note?: string;
}

/**
 * A line as two rows of text: the chords, and the words each one is over. A chord longer than the words it is over
 * (or two chords in a row) pushes the words that follow to the right, so no chord ever lands on another or off its syllable.
 */
export function chordsAboveRows(line: CopiedLine): { chords: string; words: string } {
    let chords = '';
    let words = '';
    for (const { chord, text } of line.segments) {
        if (chord !== null) {
            // Room for the chord, and one space after it before the next
            if (chords.length > 0 && chords.length + 1 > words.length) {
                words = words.padEnd(chords.length + 1);
            }
            chords = chords.padEnd(words.length) + chord;
        }
        words += text;
    }
    const note = line.note?.trim() ?? '';

    return { chords: chords.trimEnd(), words: (note === '' ? words : `${words.trimEnd()}  ${note}`).trimEnd() };
}

/** A block of the copy: a line of the song, or its section's label ("Coro") */
export type CopiedBlock = { label: string } | { line: CopiedLine } | { remark: string };

/**
 * The whole selection as text: a blank line between sections (a label starts one), a line of chords above the line of
 * words it belongs to, and a line with no chords as it is. Chords with no words (an intro) are a line of their own.
 */
export function chordsAboveText(blocks: readonly CopiedBlock[]): string {
    const out: string[] = [];
    for (const block of blocks) {
        if ('label' in block) {
            if (out.length > 0 && out[out.length - 1] !== '') {
                out.push('');
            }
            out.push(block.label);
        } else if ('remark' in block) {
            out.push(block.remark);
        } else {
            const { chords, words } = chordsAboveRows(block.line);
            if (chords !== '') {
                out.push(chords);
            }
            if (words !== '' || chords === '') {
                out.push(words);
            }
        }
    }

    // Only blank lines are trimmed at the start: the spaces of the first row of chords are its columns
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '');
}

/** The text of `node` inside `range`, leaving out the notes at the end of a line (they are read apart) */
function selectedText(node: Element, range: Range): string {
    let text = '';
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let at = walker.nextNode(); at !== null; at = walker.nextNode()) {
        if (!range.intersectsNode(at) || at.parentElement?.closest('.line__note') != null) {
            continue;
        }
        const data = (at as Text).data;
        text += data.slice(at === range.startContainer ? range.startOffset : 0, at === range.endContainer ? range.endOffset : data.length);
    }

    return text;
}

/** Whether the selection begins at or before the start of `node`: a chord is only copied with the words it starts */
function startsBefore(range: Range, node: Element): boolean {
    const first = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();

    return range.comparePoint(first ?? node, 0) >= 0;
}

/** Whether the page shows `element` (a person who turned the chords off copies the words only) */
function shown(element: Element): boolean {
    return element.checkVisibility?.() !== false;
}

/** The blocks of the song(s) a selection covers, read from the sheet as drawn (see `sheetHtml`) */
export function blocksOf(root: ParentNode, range: Range): CopiedBlock[] {
    const blocks: CopiedBlock[] = [];
    for (const element of root.querySelectorAll('.song-section__label, .line')) {
        const label = element.classList.contains('song-section__label');
        // A label is copied though the page does not draw it ("Verso 1" is shown as a number): the copy keeps the stanzas apart
        if (!range.intersectsNode(element) || (!label && !shown(element))) {
            continue;
        }
        if (label) {
            blocks.push({ label: selectedText(element, range).trim() });
            continue;
        }
        if (element.classList.contains('line--note')) {
            blocks.push({ remark: selectedText(element, range).trim() });
            continue;
        }
        const segments: CopiedSegment[] = [];
        for (const seg of element.querySelectorAll('.seg')) {
            if (!range.intersectsNode(seg)) {
                continue;
            }
            const lyric = seg.querySelector('.lyr');
            const chord = seg.querySelector('.ch');
            const text = lyric === null ? '' : selectedText(lyric, range);
            const copiesChord = chord !== null && shown(chord) && startsBefore(range, lyric ?? chord);
            segments.push({ chord: copiesChord ? (chord.textContent ?? '').trim() : null, text });
        }
        if (segments.length === 0) {
            // A line with no chords is the text of the line itself
            segments.push({ chord: null, text: selectedText(element, range).trim() });
        }
        const note = element.querySelector('.line__note');
        blocks.push({ line: { segments, ...(note !== null && range.intersectsNode(note) ? { note: note.textContent ?? '' } : {}) } });
    }

    return blocks;
}

/**
 * Makes copying a selection of a song (anywhere in the app, or on a shared list) put the chords above the words on the
 * clipboard. A selection outside a song is left to the browser. Returns what removes the listener.
 */
export function installSheetCopy(doc: Document = document): () => void {
    const onCopy = (event: ClipboardEvent): void => {
        const selection = doc.getSelection();
        if (selection === null || selection.isCollapsed || selection.rangeCount === 0 || event.clipboardData === null) {
            return;
        }
        const range = selection.getRangeAt(0);
        const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const sheet = start?.closest('.song-sheet');
        if (sheet == null) {
            return;
        }
        // A selection that crosses into another song or out of the sheet is cut at the end of the sheet it began in
        const inside = range.cloneRange();
        if (!sheet.contains(range.endContainer)) {
            inside.setEndAfter(sheet.lastChild ?? sheet);
        }
        const text = chordsAboveText(blocksOf(sheet, inside));
        if (text === '') {
            return;
        }
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();
    };
    doc.addEventListener('copy', onCopy);

    return () => doc.removeEventListener('copy', onCopy);
}
