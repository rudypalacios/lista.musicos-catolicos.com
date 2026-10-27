/**
 * The lyrics as HTML, ported from ChordSheet.php. Each word is a row of segments, a chord
 * over the text sung from it; lines wrap between words only, so a chord never gets separated
 * from its syllable.
 *
 *     <div class="song-section song-section--chorus">     ← kind: verse, chorus or other
 *       <h3 class="song-section__label">Coro</h3>
 *       <div class="line line--first">                      ← a line with chords (the first sung)
 *         <span class="w">                                  ← a word: never split across rows
 *           <span class="seg">                              ← a chord over the text sung from it
 *             <span class="ch" data-chord="G">Sol</span>
 *             <span class="lyr"><span class="syl">Cuán</span>to </span>
 *           </span>
 *         </span> …
 *       </div>
 *       <div class="line line--plain">Sin acordes</div>     ← a line without chords
 *       <div class="line line--chords">…</div>              ← chords only, no words (an intro)
 *       <div class="line line--note">x2</div>               ← an annotation ({ci: x2})
 *     </div>
 *
 * data-chord keeps the stored English name; the visible name is Latin (the default notation)
 * and the viewer rewrites it when the key or the notation change, without touching the lyrics.
 * Every piece of text goes through escapeHtml, so what a song contains can never become markup.
 */
import { latin } from './chord.ts';
import { chars, escapeHtml, trim } from './php.ts';
import { isVerseLabel, type Line, type Segment, type Sheet } from './parser.ts';
import { firstLength } from './syllable.ts';

export function sheetHtml(sheet: Pick<Sheet, 'sections'>): string {
    let html = '';
    for (const section of sheet.sections) {
        html += `<div class="song-section song-section--${escapeHtml(section.kind)}">`;
        if (section.label !== null) {
            const numbersAVerse = section.kind === 'verse' && isVerseLabel(section.label);
            html += `<h3 class="song-section__label${numbersAVerse ? ' song-section__label--verse' : ''}">`
                + `${escapeHtml(section.label)}</h3>`;
        }
        let first = true;
        for (const line of section.lines as Line[]) {
            if (typeof line === 'string') {
                html += `<div class="line line--note">${escapeHtml(line)}</div>`;
                continue;
            }
            html += lineHtml(line, first);
            first = false;
        }
        html += '</div>';
    }

    return html;
}

/** `first`: the first sung line of its section */
function lineHtml(segments: Segment[], first: boolean): string {
    const classes = 'line' + (first ? ' line--first' : '');
    if (!segments.some((segment) => segment.chord !== null)) {
        return `<div class="${classes} line--plain">${escapeHtml(trim(segments.map((s) => s.text).join('')))}</div>`;
    }

    // Chords with no words under them (an intro): the printout drops the empty text row
    const hasWords = trim(segments.map((s) => s.text).join('')) !== '';
    let html = `<div class="${classes}${hasWords ? '' : ' line--chords'}">`;
    let words = wordsOf(segments);
    // Chords after the last sung word ("así [G]"): in a narrow printed column they hang past
    // the end of the line instead of dropping to a row of their own (w--tail)
    let lastSung = -1;
    words.forEach((word, index) => {
        if (trim(word.map((s) => s.text).join('')) !== '') {
            lastSung = index;
        }
    });
    if (hasWords && lastSung < words.length - 1) {
        // One tail for all of them, so they keep their order and never overlap
        words = [...words.slice(0, lastSung + 1), words.slice(lastSung + 1).flat()];
    }
    words.forEach((word, index) => {
        html += hasWords && index > lastSung ? '<span class="w w--tail">' : '<span class="w">';
        word.forEach((segment, segmentIndex) => {
            html += segmentHtml(segment, word.slice(segmentIndex));
        });
        html += '</span>';
    });

    return html + '</div>';
}

/** `rest`: this segment and the ones after it in the word */
function segmentHtml(segment: Segment, rest: Segment[]): string {
    const text = segment.text;
    let html = '<span class="seg">';

    if (segment.chord === null) {
        return `${html}<span class="lyr">${escapeHtml(text)}</span></span>`;
    }

    // The syllable may go on in the next segment ("pa[D]labra"): measure it on the whole
    // word, underline only the part in this one
    const syllable = firstLength(rest.map((s) => s.text).join(''));
    const leading = /^\p{L}+/u.exec(text);
    const letters = leading !== null ? chars(leading[0]).length : 0;
    const length = Math.min(syllable, letters);

    html += `<span class="ch" data-chord="${escapeHtml(segment.chord)}">${escapeHtml(latin(segment.chord))}</span>`;

    if (text === '') {
        // A chord with nothing under it (end of line, or two chords in a row) keeps the row's height
        return `${html}<span class="lyr"> </span></span>`;
    }

    const letterList = chars(text);

    return html + '<span class="lyr">'
        + (length > 0 ? `<span class="syl">${escapeHtml(letterList.slice(0, length).join(''))}</span>` : '')
        + escapeHtml(letterList.slice(length).join(''))
        + '</span></span>';
}

/**
 * Splits the segments at the spaces into words (lists of segments). Text after a space inside
 * a segment becomes a chordless segment of the next word; a segment that does not follow a
 * space continues the current word ("pru[Am]eba" stays one word).
 */
function wordsOf(segments: Segment[]): Segment[][] {
    const words: Segment[][] = [];
    let afterSpace = true;

    for (const segment of segments) {
        const chunks = segment.text.split(/(?<=\s)(?=\S)/u);
        chunks.forEach((chunk, index) => {
            const piece: Segment = { chord: index === 0 ? segment.chord : null, text: chunk };
            const last = words[words.length - 1];
            if (afterSpace || last === undefined) {
                words.push([piece]);
            } else {
                last.push(piece);
            }
            // A chord with no text ("[G][D]más") stays in the word of what follows it
            afterSpace = chunk !== '' && /\s$/u.test(chunk);
        });
    }

    return words;
}
