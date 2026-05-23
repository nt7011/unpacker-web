const encoder = new TextEncoder();
const ZIP_VERSION = 20;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[i] = value >>> 0;
}

export function createStoredZipBlob(entries, options = {}) {
  const normalizedEntries = normalizeEntries(entries);
  const modifiedAt = options.modifiedAt ?? new Date();
  const dosTime = toDosTime(modifiedAt);
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of normalizedEntries) {
    const crc = crc32(entry.data);
    const localHeader = createLocalFileHeader(entry, crc, dosTime);
    const centralHeader = createCentralDirectoryHeader(entry, crc, dosTime, localOffset);

    localParts.push(localHeader, entry.nameBytes, entry.data);
    centralParts.push(centralHeader, entry.nameBytes);

    localOffset += localHeader.byteLength + entry.nameBytes.byteLength + entry.data.byteLength;
    centralSize += centralHeader.byteLength + entry.nameBytes.byteLength;
  }

  const endRecord = createEndOfCentralDirectoryRecord(
    normalizedEntries.length,
    centralSize,
    localOffset,
  );

  return new Blob([...localParts, ...centralParts, endRecord], {
    type: "application/zip",
  });
}

function normalizeEntries(entries) {
  const normalized = [];
  const seen = new Set();

  for (const entry of entries ?? []) {
    const name = normalizeZipPath(entry?.path ?? entry?.name);
    if (!name || seen.has(name)) {
      continue;
    }

    const data = toUint8Array(entry.data);
    if (data.byteLength > 0xffffffff) {
      throw new Error(`ZIP64 is not supported for ${name}`);
    }

    const nameBytes = encoder.encode(name);
    if (nameBytes.byteLength > 0xffff) {
      throw new Error(`ZIP path is too long: ${name}`);
    }

    normalized.push({ name, nameBytes, data });
    seen.add(name);
  }

  return normalized;
}

function normalizeZipPath(path) {
  const normalized = String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/g, "")
    .replace(/\/+$/g, "");
  const segments = normalized.split("/");
  if (
    !normalized
      || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid ZIP path: ${path}`);
  }
  return segments.join("/");
}

function createLocalFileHeader(entry, crc, dosTime) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, ZIP_VERSION, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, STORE_METHOD, true);
  view.setUint16(10, dosTime.time, true);
  view.setUint16(12, dosTime.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, entry.data.byteLength, true);
  view.setUint32(22, entry.data.byteLength, true);
  view.setUint16(26, entry.nameBytes.byteLength, true);
  view.setUint16(28, 0, true);
  return header;
}

function createCentralDirectoryHeader(entry, crc, dosTime, localOffset) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, ZIP_VERSION, true);
  view.setUint16(6, ZIP_VERSION, true);
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, STORE_METHOD, true);
  view.setUint16(12, dosTime.time, true);
  view.setUint16(14, dosTime.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, entry.data.byteLength, true);
  view.setUint32(24, entry.data.byteLength, true);
  view.setUint16(28, entry.nameBytes.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  return header;
}

function createEndOfCentralDirectoryRecord(entryCount, centralSize, centralOffset) {
  if (entryCount > 0xffff || centralSize > 0xffffffff || centralOffset > 0xffffffff) {
    throw new Error("ZIP64 is not supported for this output.");
  }

  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function toDosTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  throw new TypeError("ZIP entries require ArrayBuffer or typed-array data.");
}
