import { firstLength } from './syllable.ts';

/**
 * Where a chord can sit in a line of lyrics: the start of every syllable of every word, and of
 * everything else that is not a space ("1.", "(BIS)"). Indexes in the text, in order.
 */
export function syllableStarts(text: string): number[] {
    const starts = new Set<number>();
    for (const part of text.matchAll(/\S+/g)) {
        const base = part.index ?? 0;
        starts.add(base);
        for (const word of part[0].matchAll(/\p{L}+/gu)) {
            const from = base + (word.index ?? 0);
            let at = 0;
            while (at < word[0].length) {
                starts.add(from + at);
                const length = firstLength(word[0].slice(at));
                if (length <= 0) {
                    break;
                }
                at += length;
            }
        }
    }

    return [...starts].sort((a, b) => a - b);
}
