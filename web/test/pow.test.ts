import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { hasZeroBits, sha256, solve } from '../src/pow.ts';

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

describe('sha256', () => {
    it('is the SHA-256 of the system, for messages around the edges of a block', () => {
        // 55 bytes is the longest message that fits in one block with its padding; 56 and 64 go over
        for (const message of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'ñandú · 𝄞 '.repeat(40)]) {
            assert.equal(hex(sha256(encoder.encode(message))), createHash('sha256').update(message).digest('hex'), `${message.length} chars`);
        }
    });
});

describe('hasZeroBits', () => {
    it('counts the leading zero bits, as the server does', () => {
        assert.equal(hasZeroBits(Uint8Array.of(0, 0, 0xff), 16), true);
        assert.equal(hasZeroBits(Uint8Array.of(0, 1, 0xff), 16), false);
        assert.equal(hasZeroBits(Uint8Array.of(0, 0x1f), 11), true);
        assert.equal(hasZeroBits(Uint8Array.of(0, 0x20), 11), false);
        assert.equal(hasZeroBits(Uint8Array.of(0xff), 0), true);
    });
});

describe('solve', () => {
    // A challenge the length of the server's (24 hex, 13 digits and a signature of 32 hex: 71 bytes with the ":")
    const challenge = `${'a'.repeat(24)}.${'1'.repeat(13)}.${'b'.repeat(32)}`;

    it('finds a number that makes the hash of "challenge:nonce" start with the zero bits', async () => {
        const nonce = await solve({ challenge, bits: 12 });

        assert.match(nonce, /^\d+$/);
        assert.equal(hasZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest(), 12), true);
    });

    it('finds the first one, so it agrees with trying the numbers in order', async () => {
        const nonce = Number(await solve({ challenge, bits: 10 }));

        for (let earlier = 0; earlier < nonce; earlier++) {
            assert.equal(hasZeroBits(createHash('sha256').update(`${challenge}:${earlier}`).digest(), 10), false, String(earlier));
        }
    });

    it('reports its progress and can be stopped', async () => {
        const seen: number[] = [];
        let ticks = 0;
        // A clock that moves a lot per look makes every slice end after one try, so the checks happen
        let time = 0;

        await assert.rejects(
            solve({ challenge, bits: 40 }, {
                sliceMs: 1,
                now: () => (time += 10),
                onProgress: (tries) => seen.push(tries),
                cancelled: () => ++ticks > 3,
            }),
            /cancelled/,
        );
        assert.ok(seen.length >= 3, 'it said how far it had got');
        assert.deepEqual([...seen].sort((a, b) => a - b), seen, 'and only forward');
    });
});
