/**
 * Spanish syllables, just enough to underline the syllable a chord falls on. Ported from
 * Syllable.php: a heuristic over the usual rules (onset, vowel nucleus with diphthongs and
 * hiatus, and how consonants between vowels split: a-mo, can-to, ha-bla, hom-bre, cons-truir),
 * not a dictionary. The lyrics themselves are never changed.
 */
import { chars } from './php.ts';

const VOWELS = ['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú', 'ü'];

/** Vowels that never form a diphthong with each other (two of them in a row are a hiatus) */
const STRONG = ['a', 'e', 'o', 'á', 'é', 'ó', 'í', 'ú'];

/** Consonant pairs that start a syllable together (ha-bla, o-tro, mu-cho, ca-lle) */
const CLUSTERS = [
    'bl', 'br', 'cl', 'cr', 'dr', 'fl', 'fr', 'gl', 'gr', 'kl', 'kr', 'pl', 'pr', 'tl', 'tr',
    'ch', 'll', 'rr',
];

/**
 * Length, in characters, of the first syllable of `word`. `word` starts where the chord is and
 * may go on past the syllable; only its leading letters count. 0 when it does not start with
 * a letter (a chord over a space or a comma underlines nothing).
 */
export function firstLength(word: string): number {
    const leading = /^\p{L}+/u.exec(word);
    if (leading === null) {
        return 0;
    }
    const letters = chars(leading[0].toLowerCase());
    const n = letters.length;
    let i = 0;

    // Onset: the consonants before the first vowel ("qu"/"gu" before e/i are consonants)
    while (i < n && !isVowelAt(letters, i)) {
        i += isSilentU(letters, i) ? 2 : 1;
    }
    if (i >= n) {
        return n;
    }

    // Nucleus: one vowel, plus the ones that form a diphthong or triphthong with it
    i++;
    while (i < n && isVowelAt(letters, i) && !isHiatus(letters[i - 1] ?? '', letters[i] ?? '')) {
        i++;
    }

    // Coda: which of the consonants before the next vowel stay in this syllable
    let consonants = 0;
    while (i + consonants < n && !isVowelAt(letters, i + consonants)) {
        consonants++;
    }
    if (i + consonants >= n) {
        return n;
    }

    if (consonants <= 1) {
        return i;
    }
    if (consonants === 2) {
        return isCluster(letters[i] ?? '', letters[i + 1] ?? '') ? i : i + 1;
    }
    if (consonants === 3) {
        return isCluster(letters[i + 1] ?? '', letters[i + 2] ?? '') ? i + 1 : i + 2;
    }

    return i + 2;
}

/** "y" is a vowel at the end of a word or before a consonant (rey, muy, y), and a consonant before a vowel (yo, mayo) */
function isVowelAt(letters: readonly string[], i: number): boolean {
    if (letters[i] === 'y') {
        const next = letters[i + 1];

        return next === undefined || !VOWELS.includes(next);
    }

    return VOWELS.includes(letters[i] ?? '');
}

function isSilentU(letters: readonly string[], i: number): boolean {
    return ['q', 'g'].includes(letters[i] ?? '')
        && letters[i + 1] === 'u'
        && ['e', 'i', 'é', 'í'].includes(letters[i + 2] ?? '');
}

function isHiatus(a: string, b: string): boolean {
    return STRONG.includes(a) && STRONG.includes(b);
}

function isCluster(a: string, b: string): boolean {
    return CLUSTERS.includes(a + b);
}
