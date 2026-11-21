const COPY_PREFIX = 'Copia de ';

/**
 * The name of a copy: "Copia de" and the name it comes from. A copy of a copy keeps the one prefix, and the result is
 * cut to `max` characters (the longest name that kind of record may have), so a long name never makes the copy fail.
 */
export function copyOf(name: string, max: number): string {
    const full = name.startsWith(COPY_PREFIX) ? name : `${COPY_PREFIX}${name}`;

    return Array.from(full).slice(0, max).join('').trim();
}
