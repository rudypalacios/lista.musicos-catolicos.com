import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOOGLE_PROBLEMS, readGoogleReturn } from '../src/google-return.ts';

describe('the return from Google', () => {
    it('is nothing when the page was not opened by one', () => {
        assert.equal(readGoogleReturn(''), null);
        assert.equal(readGoogleReturn('?volver=%2Flistados'), null);
    });

    it('says there is a session, and whether the account was just made', () => {
        assert.deepEqual(readGoogleReturn('?google=ok'), { result: { kind: 'signed-in', created: false }, rest: '' });
        assert.deepEqual(readGoogleReturn('?google=new'), { result: { kind: 'signed-in', created: true }, rest: '' });
    });

    it('tells each problem in its own sentence', () => {
        for (const word of ['cancelled', 'unverified', 'busy', 'unavailable', 'failed'] as const) {
            assert.deepEqual(readGoogleReturn(`?google=${word}`), {
                result: { kind: 'problem', message: GOOGLE_PROBLEMS[word] },
                rest: '',
            });
        }
        assert.equal(new Set(Object.values(GOOGLE_PROBLEMS)).size, 5, 'no two say the same');
    });

    it('takes what is not a word of the server for a failure, never for a sign-in', () => {
        for (const word of ['', 'OK', 'yes', 'true', '1', 'ok ', '<script>', 'constructor', '__proto__']) {
            const read = readGoogleReturn(`?google=${encodeURIComponent(word)}`);
            assert.equal(read?.result.kind, 'problem', JSON.stringify(word));
            assert.equal(read?.result.kind === 'problem' ? read.result.message : '', GOOGLE_PROBLEMS.failed, JSON.stringify(word));
        }
    });

    it('leaves the rest of the query where it was', () => {
        assert.equal(readGoogleReturn('?google=ok&volver=%2Flistados')?.rest, '?volver=%2Flistados');
        assert.equal(readGoogleReturn('?a=1&google=busy&b=2')?.rest, '?a=1&b=2');
    });
});
