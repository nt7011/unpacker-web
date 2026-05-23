const PACKAGE_MAGIC = new Uint8Array([0x45, 0x56, 0x42, 0x00]);

const NODE_TYPE_MAIN = 0;
const NODE_TYPE_FILE = 2;
const NODE_TYPE_FOLDER = 3;

const EXTERNAL_OPTIONAL_FILE_SIZE = 61;
const LEGACY_OPTIONAL_FILE_SIZE = 49;
const CHUNK_BLOCK_SIZE = 8;

const PE32_MAGIC = 0x10b;
const PE32_PLUS_MAGIC = 0x20b;
const PE_DIRECTORY_IMPORT = 1;
const PE_DIRECTORY_EXCEPTION = 3;
const PE_DIRECTORY_RELOC = 5;
const PE_DIRECTORY_TLS = 9;
const PE_SECTION_HEADER_SIZE = 40;
const PE64_EXCEPTION_SIZE = 12;
const PE32_EXCEPTION_SIZE = 20;

const DEFAULT_FOLDER_ALTNAMES = {
  "%DEFAULT FOLDER%": "",
};

const PACKED_SECTION_PREFIX = String.fromCharCode(
  0x2e,
  0x65,
  0x6e,
  0x69,
  0x67,
  0x6d,
  0x61,
);
const PACKED_SECTION_1 = `${PACKED_SECTION_PREFIX}1`;
const PACKED_SECTION_2 = `${PACKED_SECTION_PREFIX}2`;

const RESTORATION_HEADER_OFFSETS = {
  x64: {
    "10_70": 120,
    "9_70": 108,
    "7_80": 104,
  },
  x86: {
    "10_70": 84,
    "9_70": 80,
    "7_80": 76,
  },
};

const textDecoder =
  typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : null;

export class UnpackError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnpackError";
  }
}

class BinaryReader {
  constructor(input, offset = 0) {
    this.bytes = toUint8Array(input);
    this.view = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset,
      this.bytes.byteLength,
    );
    this.offset = offset;
  }

  tell() {
    return this.offset;
  }

  seek(offset, whence = 0) {
    const next =
      whence === 0 ? offset : whence === 1 ? this.offset + offset : this.bytes.length + offset;
    if (next < 0 || next > this.bytes.length) {
      throw new UnpackError(`Seek outside input at 0x${next.toString(16)}`);
    }
    this.offset = next;
  }

  ensure(length) {
    if (length < 0 || this.offset + length > this.bytes.length) {
      throw new UnpackError(
        `Unexpected end of input at 0x${this.offset.toString(16)}`,
      );
    }
  }

  readUint8() {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  readUint32() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readBytes(length) {
    this.ensure(length);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
}

class GrowingBuffer {
  constructor(initialCapacity = 1024, maxLength = Number.MAX_SAFE_INTEGER) {
    this.buffer = new Uint8Array(Math.max(1, initialCapacity));
    this.length = 0;
    this.maxLength = maxLength;
  }

  grow(additional) {
    const required = this.length + additional;
    if (required > this.maxLength) {
      throw new UnpackError(`Decompressed output exceeded ${this.maxLength} bytes`);
    }
    if (required <= this.buffer.length) {
      return;
    }
    let capacity = this.buffer.length;
    while (capacity < required) {
      capacity *= 2;
    }
    const next = new Uint8Array(capacity);
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  push(byte) {
    this.grow(1);
    this.buffer[this.length++] = byte & 0xff;
  }

  copyFromSelf(distance, length) {
    if (distance <= 0 || distance > this.length) {
      throw new UnpackError(`Invalid aPLib back-reference distance ${distance}`);
    }
    this.grow(length);
    for (let i = 0; i < length; i += 1) {
      this.buffer[this.length] = this.buffer[this.length - distance];
      this.length += 1;
    }
  }

  toUint8Array() {
    return this.buffer.slice(0, this.length);
  }
}

export function toUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  throw new TypeError("Expected an ArrayBuffer or typed array");
}

export async function unpackBlob(blob, options = {}) {
  if (!blob || typeof blob.arrayBuffer !== "function") {
    throw new TypeError("Expected a Blob or File");
  }
  return unpack(await blob.arrayBuffer(), options);
}

export function findMagic(input, magic = PACKAGE_MAGIC) {
  const bytes = toUint8Array(input);
  const needle = toUint8Array(magic);
  if (needle.length === 0 || needle.length > bytes.length) {
    return -1;
  }
  const first = needle[0];
  const lastStart = bytes.length - needle.length;
  for (let i = 0; i <= lastStart; i += 1) {
    if (bytes[i] !== first) {
      continue;
    }
    let matched = true;
    for (let j = 1; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }
  return -1;
}

export function listFiles(input, options = {}) {
  const bytes = toUint8Array(input);
  const parsed = parseVirtualFileSystem(bytes, options);
  return {
    ...parsed,
    files: parsed.files.map(({ data: _data, ...file }) => file),
  };
}

export function unpack(input, options = {}) {
  const bytes = toUint8Array(input);
  const parsed = parseVirtualFileSystem(bytes, options);
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;

  const files = parsed.files.map((file, index) => {
    if (onProgress) {
      onProgress({
        index,
        total: parsed.files.length,
        path: file.path,
        originalSize: file.originalSize,
        storedSize: file.storedSize,
      });
    }
    return {
      ...file,
      data: extractFile(bytes, file),
    };
  });

  return {
    ...parsed,
    files,
  };
}

export function restoreExecutable(input, options = {}) {
  return restoreExecutableWithInfo(input, options).data;
}

export function restoreExecutableWithInfo(input, options = {}) {
  const source = toUint8Array(input);
  const data = source.slice();
  const pe = parsePe(data);
  const peVariant = options.peVariant || "9_70";
  const warnings = [];

  const packedSection1 = findPeSection(pe.sections, PACKED_SECTION_1);
  const packedSection2 = findPeSection(pe.sections, PACKED_SECTION_2);
  if (!packedSection1) {
    throw new UnpackError("Cannot find required packed-code section");
  }
  if (!packedSection2) {
    throw new UnpackError("Cannot find required packed-data section");
  }
  if (
    pe.sections[pe.sections.length - 2] !== packedSection1 ||
    pe.sections[pe.sections.length - 1] !== packedSection2
  ) {
    throw new UnpackError("Packed sections are not the last PE sections");
  }

  const restorationHeader = readRestorationHeader(data, packedSection1.rawPtr, pe.is64, peVariant);
  writeDataDirectory(
    pe,
    PE_DIRECTORY_IMPORT,
    restorationHeader.importAddress,
    restorationHeader.importSize,
  );
  writeDataDirectory(
    pe,
    PE_DIRECTORY_RELOC,
    restorationHeader.relocAddress,
    restorationHeader.relocSize,
  );
  if (restorationHeader.importSize === 0 || restorationHeader.relocSize === 0) {
    warnings.push(
      "Import/Reloc table size is zero. The selected PE variant may be incorrect.",
    );
  }

  const exceptionData = collectOriginalExceptionData(pe, data);
  const remainingSections = pe.sections.slice(0, -2);
  pe.view.setUint16(pe.fileHeaderOffset + 2, remainingSections.length, true);

  if (exceptionData.length > 0) {
    const exceptionOffset = searchPatternInSections(
      data,
      remainingSections,
      new Uint8Array(exceptionData.length),
    );
    if (exceptionOffset >= 0) {
      data.set(exceptionData, exceptionOffset);
      const section = sectionForOffset(remainingSections, exceptionOffset);
      if (!section) {
        throw new UnpackError("Internal PE error while placing exceptions");
      }
      if (section.rawSize < exceptionData.length) {
        section.rawSize = exceptionData.length;
        pe.view.setUint32(section.headerOffset + 16, section.rawSize, true);
      }
      writeDataDirectory(
        pe,
        PE_DIRECTORY_EXCEPTION,
        offsetToRva(section, exceptionOffset),
        exceptionData.length,
      );
    } else {
      warnings.push(
        "Cannot place Exception Directory. The restored executable may not run.",
      );
      writeDataDirectory(pe, PE_DIRECTORY_EXCEPTION, 0, 0);
    }
  } else {
    writeDataDirectory(pe, PE_DIRECTORY_EXCEPTION, 0, 0);
  }

  const tlsProbe = restorationHeader.tls.subarray(0, 12);
  const tlsOffset = searchPatternInSections(data, remainingSections, tlsProbe);
  if (tlsOffset >= 0) {
    const section = sectionForOffset(remainingSections, tlsOffset);
    if (!section) {
      throw new UnpackError("Internal PE error while placing TLS directory");
    }
    writeDataDirectory(
      pe,
      PE_DIRECTORY_TLS,
      offsetToRva(section, tlsOffset),
      pe.is64 ? 40 : 24,
    );
  } else {
    writeDataDirectory(pe, PE_DIRECTORY_TLS, 0, 0);
  }

  const overlayOffset = packedSection2.rawPtr + packedSection2.rawSize;
  ensureRange(data, 0, packedSection1.rawPtr, "packed section removal prefix");
  if (overlayOffset > data.length) {
    throw new UnpackError("Packed data section extends past end of file");
  }

  const output = new Uint8Array(packedSection1.rawPtr + data.length - overlayOffset);
  output.set(data.subarray(0, packedSection1.rawPtr), 0);
  output.set(data.subarray(overlayOffset), packedSection1.rawPtr);

  return {
    data: output,
    warnings,
    arch: pe.is64 ? "x64" : "x86",
    peVariant,
  };
}

export function parseVirtualFileSystem(input, options = {}) {
  const bytes = toUint8Array(input);
  const magicOffset =
    options.magicOffset == null ? findMagic(bytes) : options.magicOffset;
  if (magicOffset < 0) {
    throw new UnpackError("Filesystem magic not found. The file may not be supported.");
  }

  const reader = new BinaryReader(bytes, magicOffset);
  const parsed = options.legacyFs
    ? parseLegacyTree(reader)
    : parseExternalTree(reader);
  const { directories, files } = buildEntryPaths(parsed.mainNode, parsed.nodes, options);

  return {
    format: options.legacyFs ? "legacy" : "external",
    magicOffset,
    mainNode: parsed.mainNode,
    nodes: parsed.nodes,
    directories,
    files,
  };
}

export function extractFile(input, file) {
  const bytes = toUint8Array(input);
  const offset = file.offset;
  const storedSize = file.storedSize;
  const originalSize = file.originalSize;

  ensureRange(bytes, offset, storedSize, `file ${file.path || file.name}`);

  if (originalSize === storedSize) {
    return bytes.slice(offset, offset + storedSize);
  }

  const reader = new BinaryReader(bytes, offset);
  const chunkBlockSize = reader.readUint32();
  reader.readUint32();
  if (chunkBlockSize < CHUNK_BLOCK_SIZE || chunkBlockSize > storedSize) {
    throw new UnpackError(
      `Invalid compressed chunk table size ${chunkBlockSize} for ${file.path}`,
    );
  }

  const chunkData = bytes.subarray(
    offset + CHUNK_BLOCK_SIZE,
    offset + chunkBlockSize,
  );
  const chunkSizes = readChunkSizes(chunkData);
  const payloadOffset = offset + chunkBlockSize;
  const payloadEnd = offset + storedSize;
  const out = new GrowingBuffer(Math.min(originalSize, 65536), originalSize);
  let sourceOffset = payloadOffset;

  for (const chunkSize of chunkSizes) {
    if (sourceOffset >= payloadEnd) {
      break;
    }
    if (chunkSize <= 0) {
      throw new UnpackError(`Invalid compressed chunk size ${chunkSize}`);
    }
    ensureRange(bytes, sourceOffset, chunkSize, `compressed chunk for ${file.path}`);
    const chunk = bytes.subarray(sourceOffset, sourceOffset + chunkSize);
    const decompressed = aplibDecompress(chunk, {
      maxOutputSize: originalSize - out.length,
    });
    out.grow(decompressed.length);
    out.buffer.set(decompressed, out.length);
    out.length += decompressed.length;
    sourceOffset += chunkSize;
  }

  if (sourceOffset !== payloadEnd) {
    throw new UnpackError(
      `Compressed chunks for ${file.path} ended at 0x${sourceOffset.toString(16)}, expected 0x${payloadEnd.toString(16)}`,
    );
  }
  if (out.length !== originalSize) {
    throw new UnpackError(
      `Incorrect decompressed size for ${file.path}: got ${out.length}, expected ${originalSize}`,
    );
  }

  return out.toUint8Array();
}

export function aplibDecompress(input, options = {}) {
  const source = toUint8Array(input);
  const maxOutputSize = options.maxOutputSize ?? Number.MAX_SAFE_INTEGER;
  let sourceOffset = 0;
  let tag = 0;
  let bitCount = 0;
  let r0 = -1;
  let lwm = 0;

  const output = new GrowingBuffer(
    Math.min(maxOutputSize, Math.max(1024, source.length * 2)),
    maxOutputSize,
  );

  const readByte = () => {
    if (sourceOffset >= source.length) {
      throw new UnpackError("Unexpected end of aPLib stream");
    }
    return source[sourceOffset++];
  };

  const getBit = () => {
    bitCount -= 1;
    if (bitCount < 0) {
      tag = readByte();
      bitCount = 7;
    }
    const bit = (tag >> 7) & 1;
    tag = (tag << 1) & 0xff;
    return bit;
  };

  const getGamma = () => {
    let result = 1;
    do {
      result = (result << 1) | getBit();
    } while (getBit() !== 0);
    return result;
  };

  output.push(readByte());

  for (;;) {
    if (getBit() === 0) {
      output.push(readByte());
      lwm = 0;
      continue;
    }

    if (getBit() === 0) {
      let offset = getGamma();
      let length;
      if (lwm === 0 && offset === 2) {
        offset = r0;
        length = getGamma();
      } else {
        offset -= lwm === 0 ? 3 : 2;
        offset = (offset << 8) + readByte();
        length = getGamma();
        if (offset >= 32000) {
          length += 1;
        }
        if (offset >= 1280) {
          length += 1;
        }
        if (offset < 128) {
          length += 2;
        }
        r0 = offset;
      }
      output.copyFromSelf(offset, length);
      lwm = 1;
      continue;
    }

    if (getBit() === 0) {
      let offset = readByte();
      const length = 2 + (offset & 1);
      offset >>= 1;
      if (offset === 0) {
        return output.toUint8Array();
      }
      output.copyFromSelf(offset, length);
      r0 = offset;
      lwm = 1;
      continue;
    }

    let offset = 0;
    for (let i = 0; i < 4; i += 1) {
      offset = (offset << 1) | getBit();
    }
    if (offset === 0) {
      output.push(0);
    } else {
      output.copyFromSelf(offset, 1);
    }
    lwm = 0;
  }
}

function parseExternalTree(reader) {
  const header = readPackHeader(reader);
  if (!isMagic(header.signature)) {
    throw new UnpackError("Invalid package signature");
  }

  const mainNode = {
    ...readMainNode(reader),
    type: NODE_TYPE_MAIN,
    name: "",
  };
  let absoluteFileOffset = reader.tell() + mainNode.size - 12;
  reader.seek(-1, 1);

  const nodes = [];
  let maxObjectCount = 0;
  let currentObjectCount = 0;

  for (;;) {
    let headerNode;
    let namedNode;
    try {
      headerNode = readHeaderNode(reader);
      namedNode = readNamedNode(reader);
    } catch (error) {
      if (error instanceof UnpackError) {
        break;
      }
      throw error;
    }

    if (namedNode.type === NODE_TYPE_FILE) {
      const optionalNode = readOptionalFileNode(reader);
      nodes.push({
        ...headerNode,
        ...namedNode,
        ...optionalNode,
        offset: absoluteFileOffset,
      });
      absoluteFileOffset += optionalNode.storedSize;
      currentObjectCount += 1;
    } else if (namedNode.type === NODE_TYPE_FOLDER) {
      reader.readBytes(25);
      nodes.push({
        ...headerNode,
        ...namedNode,
      });
      maxObjectCount += headerNode.objectsCount;
      currentObjectCount += 1;
    } else {
      break;
    }

    if (currentObjectCount > maxObjectCount && maxObjectCount > 0) {
      break;
    }
  }

  return { mainNode, nodes };
}

function parseLegacyTree(reader) {
  const header = readPackHeader(reader);
  if (!isMagic(header.signature)) {
    throw new UnpackError("Invalid package signature");
  }

  const nodes = [];
  let mainNode = null;
  let maxObjectCount = 0;
  let currentObjectCount = 0;

  for (;;) {
    const seekOrigin = reader.tell();
    let headerNode;
    let namedNode;
    try {
      headerNode = readHeaderNode(reader);
      namedNode = readNamedNode(reader);
    } catch (error) {
      if (error instanceof UnpackError) {
        break;
      }
      throw error;
    }

    if (namedNode.type === NODE_TYPE_FILE) {
      reader.seek(
        seekOrigin + headerNode.size + 4 - LEGACY_OPTIONAL_FILE_SIZE,
      );
      const optionalNode = readOptionalLegacyFileNode(reader);
      nodes.push({
        ...headerNode,
        ...namedNode,
        ...optionalNode,
        offset: reader.tell(),
      });
      reader.seek(optionalNode.storedSize, 1);
      currentObjectCount += 1;
    } else if (namedNode.type === NODE_TYPE_FOLDER) {
      reader.seek(seekOrigin + headerNode.size + 4);
      nodes.push({
        ...headerNode,
        ...namedNode,
      });
      maxObjectCount += headerNode.objectsCount;
      currentObjectCount += 1;
    } else if (namedNode.type === NODE_TYPE_MAIN) {
      reader.seek(seekOrigin + headerNode.size + 4);
      mainNode = {
        ...headerNode,
        ...namedNode,
      };
    } else {
      break;
    }

    if (currentObjectCount > maxObjectCount && maxObjectCount > 0) {
      break;
    }
  }

  if (!mainNode) {
    throw new UnpackError("Legacy main node not found");
  }

  return { mainNode, nodes };
}

function buildEntryPaths(mainNode, nodes, options) {
  const folderAltnames = {
    ...DEFAULT_FOLDER_ALTNAMES,
    ...(options.folderAltnames || {}),
  };
  const directories = [];
  const files = [];
  let index = 0;

  const nextNode = () => {
    if (index >= nodes.length) {
      throw new UnpackError("The file table ended unexpectedly");
    }
    const node = nodes[index];
    index += 1;
    return node;
  };

  const traverse = (node, parentPath, depth) => {
    let name = node.name;
    if (node.type === NODE_TYPE_FOLDER) {
      name = Object.prototype.hasOwnProperty.call(folderAltnames, name)
        ? folderAltnames[name]
        : name;
    }
    validateNodeName(name);
    const path = joinPath(parentPath, name);

    if (node.type === NODE_TYPE_FILE) {
      files.push({
        ...node,
        name,
        path,
        depth,
      });
      return;
    }

    if (node.type === NODE_TYPE_FOLDER) {
      directories.push({
        ...node,
        name,
        path,
        depth,
      });
      for (let i = 0; i < node.objectsCount; i += 1) {
        traverse(nextNode(), path, depth + 1);
      }
    }
  };

  for (let i = 0; i < mainNode.objectsCount; i += 1) {
    traverse(nextNode(), "", 0);
  }

  return { directories, files };
}

function readPackHeader(reader) {
  const signature = reader.readBytes(4);
  reader.readBytes(60);
  return { signature };
}

function readHeaderNode(reader) {
  const size = reader.readUint32();
  reader.readBytes(8);
  const objectsCount = reader.readUint32();
  return { size, objectsCount };
}

function readMainNode(reader) {
  return readHeaderNode(reader);
}

function readNamedNode(reader) {
  const nameBytes = [];
  for (;;) {
    const lo = reader.readUint8();
    const hi = reader.readUint8();
    if (lo === 0 && hi === 0) {
      break;
    }
    nameBytes.push(lo, hi);
  }
  const type = reader.readUint8();
  return {
    name: decodeUtf16Le(new Uint8Array(nameBytes)),
    type,
    tableOffset: reader.tell(),
  };
}

function readOptionalFileNode(reader) {
  reader.readBytes(2);
  const originalSize = reader.readUint32();
  reader.readBytes(4);
  const filetime1 = reader.readBytes(8);
  const filetime2 = reader.readBytes(8);
  const filetime3 = reader.readBytes(8);
  reader.readBytes(15);
  const storedSize = reader.readUint32();
  return {
    originalSize,
    storedSize,
    filetime1,
    filetime2,
    filetime3,
  };
}

function readOptionalLegacyFileNode(reader) {
  reader.readBytes(2);
  const originalSize = reader.readUint32();
  reader.readBytes(4);
  const filetime1 = reader.readBytes(8);
  const filetime2 = reader.readBytes(8);
  const filetime3 = reader.readBytes(8);
  reader.readBytes(7);
  const storedSize = reader.readUint32();
  reader.readBytes(4);
  return {
    originalSize,
    storedSize,
    filetime1,
    filetime2,
    filetime3,
  };
}

function readChunkSizes(chunkData) {
  const view = new DataView(
    chunkData.buffer,
    chunkData.byteOffset,
    chunkData.byteLength,
  );
  const sizes = [];
  for (let offset = 0; offset + 4 <= chunkData.byteLength; offset += 12) {
    sizes.push(view.getUint32(offset, true));
  }
  return sizes;
}

function decodeUtf16Le(bytes) {
  if (bytes.length === 0) {
    return "";
  }
  if (textDecoder) {
    return textDecoder.decode(bytes);
  }

  const chars = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    chars.push(bytes[i] | (bytes[i + 1] << 8));
  }

  const parts = [];
  const chunkSize = 8192;
  for (let i = 0; i < chars.length; i += chunkSize) {
    parts.push(String.fromCharCode(...chars.slice(i, i + chunkSize)));
  }
  return parts.join("");
}

function validateNodeName(name) {
  if (name.includes("\\") || name.includes("/") || name.includes(":")) {
    throw new UnpackError(`Invalid character in node name: ${name}`);
  }
  if (name === "." || name === "..") {
    throw new UnpackError("Node name cannot be either . or ..");
  }
}

function joinPath(parentPath, name) {
  if (!name) {
    return parentPath;
  }
  if (!parentPath) {
    return name;
  }
  return `${parentPath}/${name}`;
}

function ensureRange(bytes, offset, length, label) {
  if (offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new UnpackError(`Invalid range for ${label}`);
  }
}

function isMagic(bytes) {
  return (
    bytes.length === PACKAGE_MAGIC.length &&
    bytes.every((byte, index) => byte === PACKAGE_MAGIC[index])
  );
}

function parsePe(input) {
  const bytes = toUint8Array(input);
  const view = dataViewFor(bytes);
  if (bytes.length < 0x40 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new UnpackError("Invalid PE: missing MZ header");
  }

  const peOffset = view.getUint32(0x3c, true);
  ensureRange(bytes, peOffset, 4 + 20, "PE header");
  if (
    bytes[peOffset] !== 0x50 ||
    bytes[peOffset + 1] !== 0x45 ||
    bytes[peOffset + 2] !== 0x00 ||
    bytes[peOffset + 3] !== 0x00
  ) {
    throw new UnpackError("Invalid PE signature");
  }

  const fileHeaderOffset = peOffset + 4;
  const numberOfSections = view.getUint16(fileHeaderOffset + 2, true);
  const optionalHeaderSize = view.getUint16(fileHeaderOffset + 16, true);
  const optionalHeaderOffset = fileHeaderOffset + 20;
  ensureRange(bytes, optionalHeaderOffset, optionalHeaderSize, "PE optional header");
  const optionalMagic = view.getUint16(optionalHeaderOffset, true);
  const is64 =
    optionalMagic === PE32_PLUS_MAGIC
      ? true
      : optionalMagic === PE32_MAGIC
        ? false
        : null;
  if (is64 == null) {
    throw new UnpackError(`Unsupported PE optional header magic 0x${optionalMagic.toString(16)}`);
  }

  const dataDirectoryOffset = optionalHeaderOffset + (is64 ? 112 : 96);
  const sectionHeaderOffset = optionalHeaderOffset + optionalHeaderSize;
  ensureRange(
    bytes,
    sectionHeaderOffset,
    numberOfSections * PE_SECTION_HEADER_SIZE,
    "PE section headers",
  );

  const sections = [];
  for (let i = 0; i < numberOfSections; i += 1) {
    const headerOffset = sectionHeaderOffset + i * PE_SECTION_HEADER_SIZE;
    sections.push({
      index: i,
      headerOffset,
      name: readSectionName(bytes, headerOffset),
      virtualSize: view.getUint32(headerOffset + 8, true),
      virtualAddress: view.getUint32(headerOffset + 12, true),
      rawSize: view.getUint32(headerOffset + 16, true),
      rawPtr: view.getUint32(headerOffset + 20, true),
    });
  }

  return {
    bytes,
    view,
    is64,
    peOffset,
    fileHeaderOffset,
    optionalHeaderOffset,
    dataDirectoryOffset,
    sectionHeaderOffset,
    sections,
  };
}

function readRestorationHeader(bytes, offset, is64, peVariant) {
  const arch = is64 ? "x64" : "x86";
  const importOffset = RESTORATION_HEADER_OFFSETS[arch][peVariant];
  if (importOffset == null) {
    throw new UnpackError(`Unsupported PE variant: ${peVariant}`);
  }

  const tlsLength = is64 ? 32 : 16;
  ensureRange(bytes, offset, importOffset + 24, "packed-code restoration header");
  const view = dataViewFor(bytes);
  return {
    tls: bytes.slice(offset, offset + tlsLength),
    importAddress: view.getUint32(offset + importOffset, true),
    importSize: view.getUint32(offset + importOffset + 4, true),
    relocAddress: view.getUint32(offset + importOffset + 8, true),
    relocSize: view.getUint32(offset + importOffset + 12, true),
    tlsAddress: view.getUint32(offset + importOffset + 16, true),
    tlsSize: view.getUint32(offset + importOffset + 20, true),
  };
}

function collectOriginalExceptionData(pe, data) {
  const exceptionDirectory = readDataDirectory(pe, PE_DIRECTORY_EXCEPTION);
  if (exceptionDirectory.virtualAddress === 0 || exceptionDirectory.size === 0) {
    return new Uint8Array(0);
  }

  const exceptionOffset = rvaToOffset(pe.sections, exceptionDirectory.virtualAddress);
  ensureRange(data, exceptionOffset, exceptionDirectory.size, "PE exception directory");

  const recordSize = pe.is64 ? PE64_EXCEPTION_SIZE : PE32_EXCEPTION_SIZE;
  let exceptionEnd = 0;
  for (let i = 0; i + recordSize <= exceptionDirectory.size; i += recordSize) {
    const beginAddress = pe.view.getUint32(exceptionOffset + i, true);
    const section = sectionForRva(pe.sections, beginAddress);
    if (!section) {
      break;
    }
    exceptionEnd = i;
    if (section.name.includes(PACKED_SECTION_PREFIX)) {
      break;
    }
  }

  return data.slice(exceptionOffset, exceptionOffset + exceptionEnd);
}

function readDataDirectory(pe, index) {
  const offset = pe.dataDirectoryOffset + index * 8;
  ensureRange(pe.bytes, offset, 8, "PE data directory");
  return {
    offset,
    virtualAddress: pe.view.getUint32(offset, true),
    size: pe.view.getUint32(offset + 4, true),
  };
}

function writeDataDirectory(pe, index, virtualAddress, size) {
  const offset = pe.dataDirectoryOffset + index * 8;
  ensureRange(pe.bytes, offset, 8, "PE data directory");
  pe.view.setUint32(offset, virtualAddress >>> 0, true);
  pe.view.setUint32(offset + 4, size >>> 0, true);
}

function findPeSection(sections, namePart) {
  return sections.find((section) => section.name.includes(namePart));
}

function sectionForRva(sections, rva) {
  return sections.find((section) => {
    const span = section.virtualSize || section.rawSize;
    return rva >= section.virtualAddress && rva < section.virtualAddress + span;
  });
}

function sectionForOffset(sections, offset) {
  return sections.find(
    (section) => offset >= section.rawPtr && offset < section.rawPtr + section.rawSize,
  );
}

function rvaToOffset(sections, rva) {
  const section = sectionForRva(sections, rva);
  if (!section) {
    throw new UnpackError(`Cannot map RVA 0x${rva.toString(16)} to file offset`);
  }
  return section.rawPtr + (rva - section.virtualAddress);
}

function offsetToRva(section, offset) {
  return section.virtualAddress + (offset - section.rawPtr);
}

function searchPatternInSections(bytes, sections, pattern) {
  for (const section of sections) {
    const offset = findSubarray(
      bytes,
      pattern,
      section.rawPtr,
      section.rawPtr + section.rawSize,
    );
    if (offset >= 0) {
      return offset;
    }
  }
  return -1;
}

function findSubarray(bytes, pattern, start, end) {
  if (pattern.length === 0) {
    return start;
  }
  ensureRange(bytes, start, Math.max(0, end - start), "pattern search range");
  const cappedEnd = Math.min(end, bytes.length);
  if (pattern.every((byte) => byte === 0)) {
    let runLength = 0;
    for (let i = start; i < cappedEnd; i += 1) {
      if (bytes[i] === 0) {
        runLength += 1;
        if (runLength === pattern.length) {
          return i - pattern.length + 1;
        }
      } else {
        runLength = 0;
      }
    }
    return -1;
  }

  const lastStart = cappedEnd - pattern.length;
  const first = pattern[0];
  for (let i = start; i <= lastStart; i += 1) {
    if (bytes[i] !== first) {
      continue;
    }
    let matched = true;
    for (let j = 1; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }
  return -1;
}

function readSectionName(bytes, offset) {
  const chars = [];
  for (let i = 0; i < 8; i += 1) {
    const byte = bytes[offset + i];
    if (byte === 0) {
      break;
    }
    chars.push(byte);
  }
  return String.fromCharCode(...chars);
}

function dataViewFor(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export default {
  UnpackError,
  aplibDecompress,
  extractFile,
  findMagic,
  listFiles,
  parseVirtualFileSystem,
  restoreExecutable,
  restoreExecutableWithInfo,
  toUint8Array,
  unpack,
  unpackBlob,
};
