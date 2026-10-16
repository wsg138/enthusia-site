const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 8192;
const MAX_IMAGE_PIXELS = 40_000_000;

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_PRIVATE_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);
const JPEG_METADATA_MARKERS = new Set([0xe1, 0xed, 0xfe]);

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Image data must be binary");
}

function readU32(data, offset) {
  return (
    data[offset] * 0x1000000
    + (data[offset + 1] << 16)
    + (data[offset + 2] << 8)
    + data[offset + 3]
  ) >>> 0;
}

function readU16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function ascii4(data, offset) {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

function validDimensions(width, height) {
  return Number.isInteger(width)
    && Number.isInteger(height)
    && width > 0
    && height > 0
    && width <= MAX_IMAGE_DIMENSION
    && height <= MAX_IMAGE_DIMENSION
    && width * height <= MAX_IMAGE_PIXELS;
}

function pngChunk(data, offset) {
  if (offset + 12 > data.byteLength) return null;
  const length = readU32(data, offset), type = ascii4(data, offset + 4);
  const end = offset + 12 + length;
  if (end > data.byteLength || !/^[A-Za-z]{4}$/.test(type)) return null;
  return { length, type, end, offset };
}
function pngHeader(data, chunk, state) {
  if (state.sawHeader || chunk.length !== 13 || chunk.offset !== 8) return false;
  state.width = readU32(data, chunk.offset + 8);
  state.height = readU32(data, chunk.offset + 12);
  state.sawHeader = true;
  return true;
}
function acceptPngChunk(data, chunk, state) {
  if (chunk.type === "IHDR" && !pngHeader(data, chunk, state)) return false;
  if (chunk.type === "IDAT") state.sawData = true;
  if (PNG_PRIVATE_METADATA_CHUNKS.has(chunk.type)) state.privateMetadata = true;
  if (new Set(["acTL", "fcTL", "fdAT"]).has(chunk.type)) return false;
  if (chunk.type === "IEND") {
    if (chunk.length !== 0) return false;
    state.sawEnd = true;
  }
  return true;
}
function pngInspection(state, offset, length) {
  if (!state.sawHeader || !state.sawData || !state.sawEnd || offset !== length) return null;
  if (!validDimensions(state.width, state.height)) return null;
  return { mimeType: "image/png", extension: "png", width: state.width, height: state.height, privateMetadata: state.privateMetadata };
}
function inspectPng(data) {
  if (data.byteLength < 33 || PNG_SIGNATURE.some((value,index)=>data[index]!==value)) return null;
  const state = { sawHeader: false, sawData: false, sawEnd: false, privateMetadata: false, width: null, height: null };
  let offset = 8;
  while (offset < data.byteLength) {
    const chunk = pngChunk(data, offset);
    if (!chunk || !acceptPngChunk(data, chunk, state)) return null;
    offset = chunk.end;
    if (state.sawEnd) break;
  }
  return pngInspection(state, offset, data.byteLength);
}
function jpegMarker(data, offset) {
  if (data[offset] !== 0xff) return null;
  while (offset < data.byteLength && data[offset] === 0xff) offset += 1;
  if (offset >= data.byteLength) return null;
  return { marker: data[offset], offset: offset + 1 };
}
function jpegSegment(data, offset) {
  if (offset + 2 > data.byteLength) return null;
  const length = readU16(data, offset);
  if (length < 2 || offset + length > data.byteLength) return null;
  return { length, end: offset + length };
}
function jpegInspection(state) {
  if (!validDimensions(state.width, state.height)) return null;
  return { mimeType: "image/jpeg", extension: "jpg", width: state.width, height: state.height, privateMetadata: state.privateMetadata };
}
function acceptJpegFrame(data, marker, offset, length, state) {
  if (JPEG_METADATA_MARKERS.has(marker)) state.privateMetadata = true;
  if (marker === 0xc0) {
    if (length < 8 || state.sawFrame) return false;
    state.height = readU16(data, offset + 3);
    state.width = readU16(data, offset + 5);
    state.sawFrame = true;
  } else if ((marker >= 0xc1 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) {
    return false;
  }
  return true;
}
function jpegScan(data, offset, state) {
  if (!state.sawFrame || state.sawScan) return null;
  state.sawScan = true;
  for (let index = offset; index < data.byteLength - 1; index += 1) {
    if (data[index] === 0xff && data[index + 1] === 0xd9) {
      return index + 2 === data.byteLength ? jpegInspection(state) : null;
    }
  }
  return null;
}
function inspectJpegSegment(data, marked, state) {
  const { marker, offset } = marked;
  if (marker === 0xd9) return { result: jpegEnd(data, offset, state) };
  if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return { offset };
  const segment = jpegSegment(data, offset);
  if (!segment || !acceptJpegFrame(data, marker, offset, segment.length, state)) return { result: null };
  if (marker === 0xda) return { result: jpegScan(data, segment.end, state) };
  return { offset: segment.end };
}
function jpegEnd(data, offset, state) {
  return state.sawFrame && state.sawScan && offset === data.byteLength ? jpegInspection(state) : null;
}
function inspectJpeg(data) {
  if (data.byteLength < 12 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  const state = { width: null, height: null, privateMetadata: false, sawFrame: false, sawScan: false };
  while (offset < data.byteLength) {
    const marked = jpegMarker(data, offset);
    if (!marked) return null;
    const next = inspectJpegSegment(data, marked, state);
    if (Object.hasOwn(next, "result")) return next.result;
    offset = next.offset;
  }
  return null;
}

export function inspectCompetitionImage(value) {
  const data = asBytes(value);
  if (!data.byteLength) return { ok: false, error: "image_empty" };
  if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "image_too_large" };

  const inspection = inspectPng(data) ?? inspectJpeg(data);
  if (!inspection) return { ok: false, error: "unsupported_or_invalid_image" };
  if (inspection.privateMetadata) return { ok: false, error: "image_metadata_not_stripped" };
  return { ok: true, ...inspection, byteSize: data.byteLength };
}

export async function sha256Hex(value) {
  const data = asBytes(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function competitionImageLimits() {
  return Object.freeze({
    maxBytes: MAX_IMAGE_BYTES,
    maxDimension: MAX_IMAGE_DIMENSION,
    maxPixels: MAX_IMAGE_PIXELS,
    mimeTypes: Object.freeze(["image/png", "image/jpeg"])
  });
}
