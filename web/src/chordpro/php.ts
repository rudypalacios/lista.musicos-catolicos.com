/**
 * The string behaviour of the PHP the public site runs, where JavaScript differs. The port
 * must read a song exactly as ChordPro.php does, and the two disagree on what "whitespace"
 * is: PHP's trim() strips " \t\n\r\0\x0B" and nothing else, JavaScript's also strips
 * non-breaking spaces and form feeds, which lyrics pasted from a document are full of.
 */
const TRIM_CHARS = ' \t\n\r\0\x0B';

export function trim(text: string): string {
    return ltrim(rtrim(text));
}

export function ltrim(text: string): string {
    let start = 0;
    while (start < text.length && TRIM_CHARS.includes(text.charAt(start))) {
        start++;
    }

    return text.slice(start);
}

export function rtrim(text: string): string {
    let end = text.length;
    while (end > 0 && TRIM_CHARS.includes(text.charAt(end - 1))) {
        end--;
    }

    return text.slice(0, end);
}

/** The characters of a string as code points, like mb_str_split (not UTF-16 units) */
export function chars(text: string): string[] {
    return Array.from(text);
}

/** htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8') */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
