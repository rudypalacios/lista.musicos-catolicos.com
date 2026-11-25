import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clock, MAX_LISTEN_URL, readListenUrl, youtubeEmbed } from '../src/listen-url.ts';

const ID = 'Zk3mPq8vLw4';

describe('readListenUrl', () => {
    it('is nothing for an empty text', () => {
        assert.deepEqual(readListenUrl(''), { kind: 'none' });
        assert.deepEqual(readListenUrl('   '), { kind: 'none' });
    });

    it('reads the video of every shape of YouTube link, and the second it starts at', () => {
        for (const href of [
            `https://youtu.be/${ID}`, `https://www.youtube.com/watch?v=${ID}`, `https://m.youtube.com/watch?v=${ID}&feature=share`,
            `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://www.youtube.com/live/${ID}`,
        ]) {
            const read = readListenUrl(href);

            assert.equal(read.kind, 'youtube', href);
            assert.equal(read.kind === 'youtube' && read.id, ID, href);
            assert.equal(read.kind === 'youtube' && read.site, 'YouTube', href);
        }
        assert.deepEqual(readListenUrl(`  https://music.youtube.com/watch?v=${ID}&t=75s `), { kind: 'youtube', site: 'YouTube Music', id: ID, start: 75, href: `https://music.youtube.com/watch?v=${ID}&t=75s` });
    });

    it('reads the start as seconds, minutes or hours, and ignores what it cannot read', () => {
        const start = (t: string): number | undefined => {
            const read = readListenUrl(`https://youtu.be/${ID}?t=${t}`);

            return read.kind === 'youtube' ? read.start : undefined;
        };

        assert.deepEqual([start('75'), start('75s'), start('1m15s'), start('1h2m3s'), start('abc'), start(''), start('999999')], [75, 75, 75, 3723, 0, 0, 0]);
    });

    it('is a link that opens apart for any other https address, with the name of the site it knows', () => {
        assert.deepEqual(readListenUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'), { kind: 'link', site: 'Spotify', href: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' });
        assert.deepEqual(readListenUrl('https://www.musicos-catolicos.com/tutoriales/pan'), { kind: 'link', site: 'musicos-catolicos.com', href: 'https://www.musicos-catolicos.com/tutoriales/pan' });
    });

    it('is a link, not a video, when it is YouTube but names no video (a channel, a bad id)', () => {
        assert.equal(readListenUrl('https://www.youtube.com/@musicoscatolicos').kind, 'link');
        assert.equal(readListenUrl('https://www.youtube.com/watch?v=corto').kind, 'link');
        assert.equal(readListenUrl('https://youtu.be/<script>alert1</script>').kind, 'bad');
    });

    it('refuses what is not an https link, and says why', () => {
        for (const text of ['caminamos con alegría', 'youtu.be/Zk3mPq8vLw4', 'http://youtu.be/Zk3mPq8vLw4', 'javascript:alert(1)', 'ftp://example.com/a', `https://youtu.be/${ID}"><b>`, 'https://youtu.be/a b']) {
            const read = readListenUrl(text);

            assert.equal(read.kind, 'bad', text);
            assert.match(read.kind === 'bad' ? read.why : '', /enlace/, text);
        }
    });

    it('refuses a link longer than the server accepts', () => {
        assert.equal(readListenUrl(`https://youtu.be/${'a'.repeat(MAX_LISTEN_URL)}`).kind, 'bad');
        assert.equal(readListenUrl(`https://example.com/${'a'.repeat(MAX_LISTEN_URL - 'https://example.com/'.length)}`).kind, 'link');
    });
});

describe('youtubeEmbed', () => {
    it('is the privacy-friendly host with the video id, started by the touch, from the second asked for', () => {
        assert.equal(youtubeEmbed(ID, 0), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0`);
        assert.equal(youtubeEmbed(ID, 75), `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&playsinline=1&rel=0&start=75`);
    });
});

describe('clock', () => {
    it('writes seconds as minutes and seconds, and hours when there are', () => {
        assert.deepEqual([clock(0), clock(75), clock(600), clock(3723)], ['0:00', '1:15', '10:00', '1:02:03']);
    });
});
