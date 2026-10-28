import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installContext, installOffer, type Environment } from '../src/install.ts';

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

    it('does not call Android a Safari: its offer comes from Chrome, not from a guess', () => {
        const userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
        assert.equal(installContext({ ...base, userAgent, platform: 'Linux armv81', maxTouchPoints: 5 }), 'other');
    });

    it('says nothing once the app is installed', () => {
        assert.equal(installContext({ ...base, userAgent: 'iPad', standalone: true }), 'installed');
    });
});

describe('installOffer', () => {
    it('offers Chrome\'s dialog whenever it has one, on every visit', () => {
        assert.equal(installOffer('other', true, false), 'prompt');
        assert.equal(installOffer('ios-browser', true, false), 'prompt');
    });

    it('gives Safari on iOS the steps, since it has no dialog to open', () => {
        assert.equal(installOffer('ios-browser', false, false), 'steps');
    });

    it('offers nothing where the browser has no way to install and gave no prompt', () => {
        assert.equal(installOffer('other', false, false), 'none');
    });

    it('offers nothing once installed, or after "Ahora no" on this visit', () => {
        assert.equal(installOffer('installed', true, false), 'none');
        assert.equal(installOffer('ios-browser', false, true), 'none');
        assert.equal(installOffer('other', true, true), 'none');
    });
});
