import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Status } from '../src/app.ts';
import { describeSync, showsLine } from '../src/sync-line.ts';

const status = (changes: Partial<Status>): Status => ({ state: 'idle', pending: 0, rejected: 0, durable: true, ...changes });

describe('describeSync', () => {
    it('is silent when everything is sent', () => {
        const line = describeSync(status({}));
        assert.deepEqual(line, { text: 'Sincronizado', tone: 'ok' });
        assert.equal(showsLine(line.tone), false);
    });

    it('only pulses while a sync runs, even with something waiting', () => {
        const line = describeSync(status({ state: 'syncing', pending: 2 }));
        assert.deepEqual(line, { text: 'Sincronizando…', tone: 'busy' });
        assert.equal(showsLine(line.tone), false);
    });

    it('marks what is about to be sent with the dot only, and speaks of what was refused', () => {
        const waiting = describeSync(status({ pending: 1 }));
        assert.deepEqual(waiting, { text: '1 sin enviar', tone: 'pending' });
        assert.equal(showsLine(waiting.tone), false);
        assert.deepEqual(describeSync(status({ pending: 2, rejected: 1 })), { text: '2 sin enviar · 1 rechazado', tone: 'warn' });
        assert.deepEqual(describeSync(status({ rejected: 2 })), { text: '2 rechazados', tone: 'warn' });
    });

    it('says there is no connection, quietly unless something waits', () => {
        assert.deepEqual(describeSync(status({ state: 'offline' })), { text: 'Sin conexión', tone: 'quiet' });
        assert.deepEqual(describeSync(status({ state: 'offline', pending: 2 })), { text: 'Sin conexión · 2 sin enviar', tone: 'warn' });
        assert.equal(showsLine('quiet'), true);
    });

    it('warns when the session ended, the sync failed or the browser keeps nothing', () => {
        assert.deepEqual(describeSync(status({ state: 'signed-out' })), { text: 'La sesión terminó', tone: 'warn' });
        assert.deepEqual(describeSync(status({ state: 'error' })), { text: 'Error al sincronizar', tone: 'warn' });
        assert.deepEqual(describeSync(status({ state: 'error', pending: 1 })), { text: 'Error al sincronizar · 1 sin enviar', tone: 'warn' });
        assert.equal(describeSync(status({ durable: false })).tone, 'warn');
    });
});
