/**
 * What the sign-up asks of an email and a password, said before the form goes to the server (which checks the same,
 * src/Auth/Accounts.php, and has the last word). Pure, so it is tested without a screen.
 */

/** The longest a password may be, in bytes: what the server's hash reads, so a longer one would be cut without telling */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_MIN = 10;

/** Why the email is not accepted, or null when it is */
export function emailProblem(email: string): string | null {
    const clean = email.trim();
    if (clean === '') {
        return 'Escribe tu correo.';
    }

    // The shape only (something, "@", something with a dot): whether it exists is for the confirmation link to say
    return clean.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? null : 'Escribe un correo válido.';
}

/** Why the password is not accepted, or null when it is */
export function passwordProblem(password: string): string | null {
    if (Array.from(password).length < PASSWORD_MIN) {
        return `La contraseña necesita al menos ${PASSWORD_MIN} caracteres.`;
    }

    return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES ? 'La contraseña es demasiado larga: usa menos de 72 caracteres.' : null;
}

/** Why the second copy of a new password is not accepted, or null when it matches (the person typed it twice to be sure of it) */
export function confirmationProblem(password: string, again: string): string | null {
    return password === again ? null : 'Las dos contraseñas no coinciden.';
}
