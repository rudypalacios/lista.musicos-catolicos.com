/**
 * Calendar days as the app uses them: `YYYY-MM-DD`, the day of a Mass, with no time and no
 * time zone (a Mass on the 1st is on the 1st wherever the phone is).
 */

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a real calendar day written `YYYY-MM-DD` ("2026-02-30" is not) */
export function isValidDate(value: string): boolean {
    const match = PATTERN.exec(value);
    if (match === null) {
        return false;
    }
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today by the clock and the time zone of this device (not UTC: at night in America, UTC is tomorrow) */
export function today(now: Date = new Date()): string {
    const pad = (n: number): string => String(n).padStart(2, '0');

    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function utc(value: string): Date {
    return new Date(`${value}T00:00:00Z`);
}

/** "domingo, 1 de noviembre de 2026" */
export function longDate(value: string): string {
    return new Intl.DateTimeFormat('es', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(utc(value));
}

/** "1 de noviembre" */
export function shortDate(value: string): string {
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(utc(value));
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** "dom 1 nov": for a line of detail. A fixed table, so every device writes it the same */
export function shortDay(value: string): string {
    const date = utc(value);

    return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}
