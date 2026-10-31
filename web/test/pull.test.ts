import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inPullZone, isPull, PULL_MAX, PULL_ZONE, scrolledWithin, PULL_TRIGGER, pullAnswer, pullArmed, pullHint, pullOffset } from '../src/pull.ts';

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

describe('inPullZone', () => {
    it('starts only in the top third of the screen', () => {
        assert.equal(inPullZone(100, 100, 900), true);
        assert.equal(inPullZone(100 + 900 * PULL_ZONE, 100, 900), true);
        assert.equal(inPullZone(100 + 900 * PULL_ZONE + 1, 100, 900), false);
        assert.equal(inPullZone(800, 100, 900), false);
    });

    it('is not above the screen either (the bar)', () => {
        assert.equal(inPullZone(40, 100, 900), false);
    });
});

describe('scrolledWithin', () => {
    const chain = (...tops: number[]): { target: Element; container: Element } => {
        const nodes = tops.map((scrollTop) => ({ scrollTop, parentElement: null as unknown }));
        nodes.forEach((node, index) => { node.parentElement = nodes[index + 1] ?? null; });

        return { target: nodes[0] as unknown as Element, container: nodes[nodes.length - 1] as unknown as Element };
    };

    it('is false when nothing from the touched element up to the screen is scrolled', () => {
        const { target, container } = chain(0, 0, 0);
        assert.equal(scrolledWithin(target, container), false);
    });

    it('is true when something in between is scrolled, though the screen itself is at its top', () => {
        const { target, container } = chain(0, 240, 0);
        assert.equal(scrolledWithin(target, container), true);
    });

    it('is true when the screen itself is scrolled', () => {
        const { target, container } = chain(0, 0, 50);
        assert.equal(scrolledWithin(target, container), true);
    });
});
