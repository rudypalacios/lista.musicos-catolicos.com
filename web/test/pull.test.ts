import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isPull, PULL_MAX, PULL_TRIGGER, pullAnswer, pullArmed, pullHint, pullOffset } from '../src/pull.ts';

describe('pullOffset', () => {
    it('follows the finger at half the way, and never goes up', () => {
        assert.equal(pullOffset(40), 20);
        assert.equal(pullOffset(-30), 0);
    });

    it('stops at the most the screen may be drawn down', () => {
        assert.equal(pullOffset(1000), PULL_MAX);
    });
});

describe('pullArmed', () => {
    it('needs a deliberate drag: a short one does nothing', () => {
        assert.equal(pullArmed(PULL_TRIGGER), false);
        assert.equal(pullArmed(PULL_TRIGGER * 2 - 1), false);
        assert.equal(pullArmed(PULL_TRIGGER * 2), true);
    });
});

describe('isPull', () => {
    it('is a mostly vertical move downwards', () => {
        assert.equal(isPull(2, 30), true);
        assert.equal(isPull(15, 30), true);
    });

    it('is not a move that has not decided yet, an upward one or a sideways one', () => {
        assert.equal(isPull(2, 5), false);
        assert.equal(isPull(0, -40), false);
        assert.equal(isPull(60, 20), false);
    });
});

describe('what the person reads', () => {
    it('says to pull, then to let go', () => {
        assert.equal(pullHint(30), 'Jala para sincronizar');
        assert.equal(pullHint(PULL_TRIGGER * 2), 'Suelta para sincronizar');
    });

    it('answers how the sync ended', () => {
        assert.equal(pullAnswer('idle'), 'Sincronizado');
        assert.equal(pullAnswer('offline'), 'Sin conexión');
        assert.equal(pullAnswer('signed-out'), 'La sesión terminó');
        assert.equal(pullAnswer('error'), 'No se pudo sincronizar');
    });
});
