import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CODE_PATTERN, shareFailure, shareSummary, shareUrl } from '../src/share.ts';

describe('shareUrl', () => {
    it('is the address of this site and the code', () => {
        assert.equal(shareUrl('https://lista.musicos-catolicos.com', 'a'.repeat(32)), `https://lista.musicos-catolicos.com/c/${'a'.repeat(32)}`);
    });
});

describe('CODE_PATTERN', () => {
    it('is 32 lower-case hex characters and nothing else', () => {
        assert.ok(CODE_PATTERN.test('0123456789abcdef0123456789abcdef'));
        for (const bad of ['', 'abc', 'A'.repeat(32), 'g'.repeat(32), `${'a'.repeat(32)}0`, `${'a'.repeat(31)}/`]) {
            assert.equal(CODE_PATTERN.test(bad), false, bad);
        }
    });
});

describe('shareSummary', () => {
    it('says what the link carries', () => {
        assert.match(shareSummary(true), /letra y acordes/);
        assert.match(shareSummary(false), /solo el orden/);
    });
});

describe('shareFailure', () => {
    it('says offline in its own words and passes the server\'s message on', () => {
        assert.match(shareFailure({ status: 0, message: 'Sin conexión.' }), /necesita conexión/);
        assert.equal(shareFailure({ status: 404, message: 'Este listado todavía no está en el servidor.' }), 'Este listado todavía no está en el servidor.');
        assert.match(shareFailure(null), /No se pudo compartir/);
    });
});
