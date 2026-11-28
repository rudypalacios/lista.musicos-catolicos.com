import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crc32, zip } from '../src/zip.ts';

/** Reads a zip the way an unzipper does: the end record, then the central directory, then each file, checking its CRC */
function unzip(bytes: Uint8Array): Map<string, string> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 22;
    assert.equal(view.getUint32(end, true), 0x06054b50, 'the end record is where it should be');
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const files = new Map<string, string>();
    for (let i = 0; i < count; i++) {
        assert.equal(view.getUint32(at, true), 0x02014b50);
        assert.equal(view.getUint16(at + 8, true) & 0x0800, 0x0800, 'names are UTF-8');
        assert.equal(view.getUint16(at + 10, true), 0, 'stored');
        const crc = view.getUint32(at + 16, true);
        const size = view.getUint32(at + 24, true);
        const nameLength = view.getUint16(at + 28, true);
        const local = view.getUint32(at + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
        assert.equal(view.getUint32(local, true), 0x04034b50);
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        assert.equal(crc32(data), crc, `the CRC of ${name}`);
        files.set(name, new TextDecoder().decode(data));
        at += 46 + nameLength;
    }

    return files;
}

describe('zip', () => {
    it('has the CRC-32 every zip tool computes', () => {
        assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
        assert.equal(crc32(new Uint8Array(0)), 0);
    });

    it('holds every file with its name and its text, accents included', () => {
        const encoder = new TextEncoder();
        const made = zip([
            { name: 'cantos/Aleluya, cantad al Señor.txt', data: encoder.encode('{title: Aleluya}\n\n[C]Cantad\n') },
            { name: 'listados.txt', data: encoder.encode('Misa\n') },
            { name: 'cantos/Vacío.txt', data: new Uint8Array(0) },
        ], new Date(2026, 10, 28, 9, 30, 10));

        assert.deepEqual([...unzip(made)], [
            ['cantos/Aleluya, cantad al Señor.txt', '{title: Aleluya}\n\n[C]Cantad\n'],
            ['listados.txt', 'Misa\n'],
            ['cantos/Vacío.txt', ''],
        ]);
    });

    it('is a valid, empty zip with no files', () => {
        const made = zip([]);

        assert.equal(made.length, 22);
        assert.equal(unzip(made).size, 0);
    });

    it('writes the date of the files as DOS counts it', () => {
        const made = zip([{ name: 'a.txt', data: new Uint8Array([97]) }], new Date(2026, 10, 28, 9, 30, 10));
        const view = new DataView(made.buffer);

        assert.equal(view.getUint16(10, true), (9 << 11) | (30 << 5) | 5, 'time: 09:30:10');
        assert.equal(view.getUint16(12, true), ((2026 - 1980) << 9) | (11 << 5) | 28, 'date: 2026-11-28');
    });

    it('can be unzipped by a real unzipper', async () => {
        const { spawnSync } = await import('node:child_process');
        const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const probe = spawnSync('python3', ['-c', 'import zipfile'], { encoding: 'utf8' });
        if (probe.status !== 0) {
            return; // no python3 to check against here: the reader above already checks the format
        }
        const dir = mkdtempSync(join(tmpdir(), 'zip-'));
        const file = join(dir, 'copia.zip');
        writeFileSync(file, zip([{ name: 'cantos/Señor, ten piedad.txt', data: new TextEncoder().encode('Kyrie\n') }]));

        const out = spawnSync('python3', ['-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.testzip()); print(z.namelist()[0]); print(z.read(z.namelist()[0]).decode())', file], { encoding: 'utf8' });

        assert.equal(out.status, 0, out.stderr);
        assert.deepEqual(out.stdout.split('\n').slice(0, 3), ['None', 'cantos/Señor, ten piedad.txt', 'Kyrie']);
        assert.ok(readFileSync(file).length > 0);
    });
});
