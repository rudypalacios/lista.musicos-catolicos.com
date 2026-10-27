import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shellVersion } from '../../scripts/precache.ts';

describe('shellVersion', () => {
    const files = [
        { url: '/index.html', content: '<html>' },
        { url: '/assets/main-A.js', content: 'console.log(1)' },
    ];

    it('is stable for the same files in any order', () => {
        assert.equal(shellVersion(files), shellVersion([...files].reverse()));
    });

    it('is 12 hex characters', () => {
        assert.match(shellVersion(files), /^[0-9a-f]{12}$/);
    });

    it('changes when a file changes', () => {
        const changed = [files[0]!, { url: '/assets/main-A.js', content: 'console.log(2)' }];

        assert.notEqual(shellVersion(files), shellVersion(changed));
    });

    it('changes when a file is added or renamed', () => {
        assert.notEqual(shellVersion(files), shellVersion(files.slice(0, 1)));
        assert.notEqual(shellVersion(files), shellVersion([files[0]!, { ...files[1]!, url: '/assets/main-B.js' }]));
    });

    it('does not confuse where one file ends and the next begins', () => {
        const a = [{ url: '/a', content: 'bc' }, { url: '/d', content: 'e' }];
        const b = [{ url: '/ab', content: 'c' }, { url: '/d', content: 'e' }];

        assert.notEqual(shellVersion(a), shellVersion(b));
    });
});
