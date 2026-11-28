/**
 * A `.zip` with the files stored as they are (no compression: the files are small text, and writing it takes no library). The names
 * are UTF-8 (flag 0x0800), so "Aleluya, cantad al Señor.txt" opens with its accents on every system.
 */

export interface ZipEntry {
    readonly name: string;
    readonly data: Uint8Array;
}

const CRC_TABLE = ((): Uint32Array => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }

    return table;
})();

/** The CRC-32 of the bytes, as the zip format wants it */
export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

/** The date and the time of a file as DOS counts them (two seconds of resolution; nothing before 1980) */
function dosStamp(date: Date): { time: number; day: number } {
    const year = Math.max(1980, date.getFullYear());

    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

/** The bytes of a zip with these files, in this order */
export function zip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
    const encoder = new TextEncoder();
    const { time, day } = dosStamp(now);
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const crc = crc32(entry.data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true); // version needed
        local.setUint16(6, 0x0800, true); // names are UTF-8
        local.setUint16(8, 0, true); // stored
        local.setUint16(10, time, true);
        local.setUint16(12, day, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, entry.data.length, true);
        local.setUint32(22, entry.data.length, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);

        const header = new DataView(new ArrayBuffer(46));
        header.setUint32(0, 0x02014b50, true);
        header.setUint16(4, 20, true); // version made by
        header.setUint16(6, 20, true);
        header.setUint16(8, 0x0800, true);
        header.setUint16(10, 0, true);
        header.setUint16(12, time, true);
        header.setUint16(14, day, true);
        header.setUint32(16, crc, true);
        header.setUint32(20, entry.data.length, true);
        header.setUint32(24, entry.data.length, true);
        header.setUint16(28, name.length, true);
        header.setUint32(42, offset, true);

        const localBytes = new Uint8Array(local.buffer);
        parts.push(localBytes, name, entry.data);
        central.push(new Uint8Array(header.buffer), name);
        offset += localBytes.length + name.length + entry.data.length;
    }

    const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((sum, bytes) => sum + bytes.length, 0));
    let at = 0;
    for (const bytes of all) {
        out.set(bytes, at);
        at += bytes.length;
    }

    return out;
}
