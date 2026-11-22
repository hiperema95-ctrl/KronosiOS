/**
 * Pure TypeScript PKZIP (Store / Method 0) archive builder with IEEE 802.3 CRC-32.
 * Produces deterministic, standard .zip archives in browser and Node without external dependencies.
 */

export interface ZipInputFile {
  path: string;
  content: string | Uint8Array;
  executable?: boolean;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeU32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

export function buildZipBytes(files: ZipInputFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  // Fixed deterministic DOS timestamp (2026-01-01 00:00:00)
  const dosTime = 0x0000;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const file of files) {
    const cleanPath = file.path.replace(/^\/+/, '');
    const nameBytes = encoder.encode(cleanPath);
    const dataBytes =
      typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = computeCrc32(dataBytes);

    // Local File Header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    writeU32LE(lv, 0, 0x04034b50); // Local file header signature
    writeU16LE(lv, 4, 20); // Version needed to extract (2.0)
    writeU16LE(lv, 6, 0x0800); // UTF-8 filename flag
    writeU16LE(lv, 8, 0); // Compression method: 0 (store)
    writeU16LE(lv, 10, dosTime);
    writeU16LE(lv, 12, dosDate);
    writeU32LE(lv, 14, crc);
    writeU32LE(lv, 18, dataBytes.length);
    writeU32LE(lv, 22, dataBytes.length);
    writeU16LE(lv, 26, nameBytes.length);
    writeU16LE(lv, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central Directory Header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    const unixPerms = file.executable ? 0o100755 : 0o100644;
    writeU32LE(cv, 0, 0x02014b50); // Central directory signature
    writeU16LE(cv, 4, (3 << 8) | 20); // Made by UNIX (3), spec 2.0
    writeU16LE(cv, 6, 20); // Version needed
    writeU16LE(cv, 8, 0x0800); // UTF-8 flag
    writeU16LE(cv, 10, 0); // Store
    writeU16LE(cv, 12, dosTime);
    writeU16LE(cv, 14, dosDate);
    writeU32LE(cv, 16, crc);
    writeU32LE(cv, 20, dataBytes.length);
    writeU32LE(cv, 24, dataBytes.length);
    writeU16LE(cv, 28, nameBytes.length);
    writeU16LE(cv, 30, 0);
    writeU16LE(cv, 32, 0);
    writeU16LE(cv, 34, 0);
    writeU16LE(cv, 36, 0);
    writeU32LE(cv, 38, (unixPerms << 16) >>> 0);
    writeU32LE(cv, 42, offset);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((acc, part) => acc + part.length, 0);

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  writeU32LE(ev, 0, 0x06054b50);
  writeU16LE(ev, 4, 0);
  writeU16LE(ev, 6, 0);
  writeU16LE(ev, 8, files.length);
  writeU16LE(ev, 10, files.length);
  writeU32LE(ev, 12, centralSize);
  writeU32LE(ev, 16, offset);
  writeU16LE(ev, 20, 0);

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;

  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);

  return output;
}

export function createZipBlob(files: ZipInputFile[]): Blob {
  const bytes = buildZipBytes(files);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'application/zip' });
}
