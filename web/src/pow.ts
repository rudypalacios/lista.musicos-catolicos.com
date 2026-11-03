/**
 * The proof of work the server asks before a sign-up or a password reset (src/Security/ProofOfWork.php): find a number
 * `nonce` such that SHA-256 of `challenge:nonce` starts with `bits` zero bits. It runs here, on the device, in slices so
 * the screen keeps moving, and asks nothing of any other domain. SHA-256 is written out (the browser's own is
 * asynchronous, and a quarter of a million awaited calls take several seconds).
 */

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19] as const;

/** Mixes the 64 bytes of `bytes` from `offset` into the state `h`; `w` is scratch space for the schedule */
function compress(h: Uint32Array, bytes: Uint8Array, offset: number, w: Uint32Array): void {
    for (let i = 0; i < 16; i++) {
        const at = offset + i * 4;
        w[i] = ((bytes[at] as number) << 24) | ((bytes[at + 1] as number) << 16) | ((bytes[at + 2] as number) << 8) | (bytes[at + 3] as number);
    }
    for (let i = 16; i < 64; i++) {
        const a = w[i - 15] as number;
        const b = w[i - 2] as number;
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0;
    }
    let a = h[0] as number;
    let b = h[1] as number;
    let c = h[2] as number;
    let d = h[3] as number;
    let e = h[4] as number;
    let f = h[5] as number;
    let g = h[6] as number;
    let hh = h[7] as number;
    for (let i = 0; i < 64; i++) {
        const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (hh + s1 + ((e & f) ^ (~e & g)) + (K[i] as number) + (w[i] as number)) | 0;
        const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
    }
    h[0] = (h[0] as number) + a;
    h[1] = (h[1] as number) + b;
    h[2] = (h[2] as number) + c;
    h[3] = (h[3] as number) + d;
    h[4] = (h[4] as number) + e;
    h[5] = (h[5] as number) + f;
    h[6] = (h[6] as number) + g;
    h[7] = (h[7] as number) + hh;
}

/** The state written as the 32 bytes of the digest */
function digestOf(h: Uint32Array, out: Uint8Array): Uint8Array {
    for (let i = 0; i < 8; i++) {
        const word = h[i] as number;
        out[i * 4] = word >>> 24;
        out[i * 4 + 1] = (word >>> 16) & 0xff;
        out[i * 4 + 2] = (word >>> 8) & 0xff;
        out[i * 4 + 3] = word & 0xff;
    }

    return out;
}

/** Puts the 1 bit, the zeros and the length (in bits, 64 of them) after `used` bytes of message; `total` is the whole message's length */
function pad(buffer: Uint8Array, used: number, total: number): number {
    const size = Math.ceil((used + 9) / 64) * 64;
    buffer.fill(0, used, size);
    buffer[used] = 0x80;
    const bits = total * 8;
    buffer[size - 4] = (bits >>> 24) & 0xff;
    buffer[size - 3] = (bits >>> 16) & 0xff;
    buffer[size - 2] = (bits >>> 8) & 0xff;
    buffer[size - 1] = bits & 0xff;
    // Messages here are far below 2^32 bits; the high word stays zero (a message of 512 MB would need it)

    return size;
}

/** The SHA-256 of the bytes */
export function sha256(message: Uint8Array): Uint8Array {
    const buffer = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
    buffer.set(message);
    const size = pad(buffer, message.length, message.length);
    const h = new Uint32Array(INITIAL);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < size; offset += 64) {
        compress(h, buffer, offset, w);
    }

    return digestOf(h, new Uint8Array(32));
}

/** Whether the first `bits` bits of the digest are zero */
export function hasZeroBits(digest: Uint8Array, bits: number): boolean {
    const whole = Math.floor(bits / 8);
    for (let i = 0; i < whole; i++) {
        if (digest[i] !== 0) {
            return false;
        }
    }
    const rest = bits % 8;

    return rest === 0 || ((digest[whole] as number) >> (8 - rest)) === 0;
}

/** A challenge the server handed out (`GET /api/challenge`) */
export interface Challenge {
    challenge: string;
    bits: number;
}

export interface Solving {
    /** Called now and then with the number of tries so far, for a progress bar */
    onProgress?: (tries: number) => void;
    /** Set to stop (the person left the screen): the promise then rejects */
    cancelled?: () => boolean;
    /** How long a slice may take (ms) before the screen is given a turn; and the clock, for tests */
    sliceMs?: number;
    now?: () => number;
}

/**
 * The nonce (as the server reads it: digits) that solves the challenge. The challenge is the same for every try, so the
 * blocks it fills are mixed once and each try mixes only what comes after (about one block). @throws Error('cancelled')
 * when stopped.
 */
export async function solve(puzzle: Challenge, options: Solving = {}): Promise<string> {
    const prefix = new TextEncoder().encode(`${puzzle.challenge}:`);
    const whole = Math.floor(prefix.length / 64) * 64;
    const midstate = new Uint32Array(INITIAL);
    const w = new Uint32Array(64);
    for (let offset = 0; offset < whole; offset += 64) {
        compress(midstate, prefix, offset, w);
    }
    const state = new Uint32Array(8);
    const digest = new Uint8Array(32);
    // What is left of the prefix, then room for the digits (20 at most) and the padding
    const tail = prefix.length - whole;
    const buffer = new Uint8Array(Math.ceil((tail + 20 + 9) / 64) * 64);
    buffer.set(prefix.subarray(whole));
    const sliceMs = options.sliceMs ?? 25;
    const now = options.now ?? (() => performance.now());
    let nonce = 0;
    for (;;) {
        const until = now() + sliceMs;
        do {
            let used = tail;
            const text = String(nonce);
            for (let i = 0; i < text.length; i++) {
                buffer[used++] = text.charCodeAt(i);
            }
            const size = pad(buffer, used, whole + used);
            state.set(midstate);
            for (let offset = 0; offset < size; offset += 64) {
                compress(state, buffer, offset, w);
            }
            if (hasZeroBits(digestOf(state, digest), puzzle.bits)) {
                return String(nonce);
            }
            nonce++;
        } while (now() < until);
        if (options.cancelled?.() === true) {
            throw new Error('cancelled');
        }
        options.onProgress?.(nonce);
        // Give the screen a turn: a progress bar that does not move looks like a frozen app
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
}
