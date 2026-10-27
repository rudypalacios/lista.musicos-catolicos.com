import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextUpdateState, type UpdateEvent, type UpdateState } from '../src/updates.ts';

const none: UpdateState = { kind: 'none' };
const run = (events: UpdateEvent[], from: UpdateState = none): UpdateState =>
    events.reduce<UpdateState>((state, event) => nextUpdateState(state, event), from);

describe('update states', () => {
    it('goes none → downloading → ready → applying on the happy path', () => {
        assert.equal(run(['found']).kind, 'downloading');
        assert.equal(run(['found', 'installed']).kind, 'ready');
        assert.equal(run(['found', 'installed', 'accepted']).kind, 'applying');
    });

    it('says an update is stuck when it does not apply in time, and can be retried', () => {
        assert.equal(run(['found', 'installed', 'accepted', 'timeout']).kind, 'stuck');
        assert.equal(run(['found', 'installed', 'accepted', 'timeout', 'retry']).kind, 'applying');
    });

    it('is stuck, not silent, when the worker vanishes while applying', () => {
        assert.equal(run(['found', 'installed', 'accepted', 'redundant']).kind, 'stuck');
    });

    it('drops the banner when the downloading worker fails', () => {
        assert.equal(run(['found', 'redundant']).kind, 'none');
    });

    it('lets a newer version replace one that was ready or stuck', () => {
        assert.equal(run(['found', 'installed', 'found']).kind, 'downloading');
        assert.equal(run(['found', 'installed', 'accepted', 'timeout', 'found']).kind, 'downloading');
    });

    it('does not interrupt an update that is applying when another version is found', () => {
        assert.equal(run(['found', 'installed', 'accepted', 'found']).kind, 'applying');
    });

    it('ignores events that make no sense in a state', () => {
        assert.equal(run(['installed']).kind, 'none');
        assert.equal(run(['accepted']).kind, 'none');
        assert.equal(run(['timeout']).kind, 'none');
        assert.equal(run(['retry']).kind, 'none');
        assert.equal(run(['found', 'timeout']).kind, 'downloading');
    });
});
