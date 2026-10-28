import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeAwake, ScreenKeeper, type AwakeState, type WakeLockApi, type WakeLockSentinelLike } from '../src/wakelock.ts';

/** A Wake Lock that counts what it was asked, and can lose a lock the way a hidden page does */
class FakeLock implements WakeLockApi {
    requests = 0;
    released = 0;
    refuse = false;
    private readonly drops: Array<() => void> = [];

    request(): Promise<WakeLockSentinelLike> {
        this.requests++;
        if (this.refuse) {
            return Promise.reject(new Error('NotAllowedError'));
        }

        return Promise.resolve({
            addEventListener: (_type, listener) => {
                this.drops.push(listener);
            },
            release: () => {
                this.released++;

                return Promise.resolve();
            },
        });
    }

    /** The browser takes the lock away (the page went to the background) */
    drop(): void {
        this.drops.splice(0).forEach((listener) => listener());
    }
}

const tick = (ms = 10): Promise<void> => new Promise((done) => setTimeout(done, ms));

describe('ScreenKeeper', () => {
    it('asks for the lock when a screen holds it and gives it back after the grace time', async () => {
        const lock = new FakeLock();
        const keeper = new ScreenKeeper(lock, 5);
        const release = keeper.hold();
        await tick();
        assert.equal(keeper.state(), 'on');
        assert.equal(lock.requests, 1);
        release();
        assert.equal(lock.released, 0, 'not at once');
        await tick();
        assert.equal(lock.released, 1);
        assert.equal(keeper.state(), 'off');
    });

    it('keeps one lock while songs change: the next screen holds before the grace time ends', async () => {
        const lock = new FakeLock();
        const keeper = new ScreenKeeper(lock, 20);
        const first = keeper.hold();
        await tick();
        first();
        keeper.hold();
        await tick(40);
        assert.equal(lock.requests, 1);
        assert.equal(lock.released, 0);
        assert.equal(keeper.state(), 'on');
    });

    it('asks again when the page comes back after the browser dropped the lock', async () => {
        const lock = new FakeLock();
        const keeper = new ScreenKeeper(lock, 5);
        keeper.hold();
        await tick();
        lock.drop();
        assert.equal(keeper.state(), 'off');
        keeper.resume();
        await tick();
        assert.equal(keeper.state(), 'on');
        assert.equal(lock.requests, 2);
    });

    it('does not ask when nobody holds it', async () => {
        const lock = new FakeLock();
        new ScreenKeeper(lock, 5).resume();
        await tick();
        assert.equal(lock.requests, 0);
    });

    it('reports a refusal and an unsupported browser instead of hiding them', async () => {
        const refusing = new FakeLock();
        refusing.refuse = true;
        const blocked = new ScreenKeeper(refusing, 5);
        blocked.hold();
        await tick();
        assert.equal(blocked.state(), 'blocked');

        const none = new ScreenKeeper(undefined, 5);
        none.hold();
        await tick();
        assert.equal(none.state(), 'unsupported');
    });

    it('gives back a lock that arrived after everyone let go', async () => {
        const lock = new FakeLock();
        const keeper = new ScreenKeeper(lock, 5);
        keeper.hold()();
        await tick(30);
        assert.equal(lock.released, 1);
        assert.equal(keeper.state(), 'off');
    });

    it('tells the listeners about every change, once', async () => {
        const lock = new FakeLock();
        const keeper = new ScreenKeeper(lock, 5);
        const seen: AwakeState[] = [];
        keeper.onChange((state) => seen.push(state));
        const release = keeper.hold();
        await tick();
        release();
        release();
        await tick(30);
        assert.deepEqual(seen, ['on', 'off']);
    });
});

describe('describeAwake', () => {
    it('says what is so, and what the person chose when they did not ask for it', () => {
        assert.match(describeAwake(true, 'on'), /se mantiene encendida/);
        assert.match(describeAwake(true, 'unsupported'), /no deja/);
        assert.match(describeAwake(true, 'blocked'), /No se pudo/);
        assert.match(describeAwake(false, 'on'), /Ajustes/);
    });
});
