/**
 * Keys as pitches, for the one thing that needs it: when the key a song is written in moves (the chart is
 * corrected from Do to Re), the keys people sing it in must move the other way so they sound the same.
 */

const SEMITONE: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A shift kept within a tritone either way (−6…6): the shortest way round, 6 for the tritone itself */
export function nearestShift(semitones: number): number {
    const rest = ((Math.trunc(semitones) % 12) + 12) % 12;

    return rest > 6 ? rest - 12 : rest;
}

/**
 * How many semitones up `to` is from `from`, the shortest way round (−5…6); keys are English names
 * as the parser gives them ("C", "F#", "Am": minor and major of one root are the same pitch). Null
 * when either is not a key.
 */
export function keyDistance(from: string | null, to: string | null): number | null {
    const pitch = (name: string | null): number | null => {
        const m = name === null ? null : /^([A-G])([#b]?)/.exec(name);
        if (m === null || m === undefined) {
            return null;
        }

        return (SEMITONE[m[1] ?? ''] ?? 0) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    };
    const a = pitch(from);
    const b = pitch(to);

    return a === null || b === null ? null : nearestShift(b - a);
}
