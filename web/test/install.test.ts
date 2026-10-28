import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installContext, type Environment } from '../src/install.ts';

const base: Environment = { userAgent: '', platform: '', maxTouchPoints: 0, standalone: false };

describe('installContext', () => {
    it('suggests the home screen to Safari on an iPhone', () => {
        const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
        assert.equal(installContext({ ...base, userAgent, platform: 'iPhone', maxTouchPoints: 5 }), 'ios-browser');
    });

    it('recognises an iPad that presents itself as a Mac', () => {
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15';
        assert.equal(installContext({ ...base, userAgent, platform: 'MacIntel', maxTouchPoints: 5 }), 'ios-browser');
    });

    it('does not mistake a real Mac (no touch screen) for an iPad', () => {
        const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15';
        assert.equal(installContext({ ...base, userAgent, platform: 'MacIntel', maxTouchPoints: 0 }), 'other');
    });

    it('says nothing on Android, whose Chrome offers the install itself', () => {
        const userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
        assert.equal(installContext({ ...base, userAgent, platform: 'Linux armv81', maxTouchPoints: 5 }), 'other');
    });

    it('says nothing once the app is installed', () => {
        assert.equal(installContext({ ...base, userAgent: 'iPad', standalone: true }), 'installed');
    });
});
