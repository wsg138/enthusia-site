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

function inspectPng(data) {
  if (data.byteLength < 33) return null;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (data[index] !== PNG_SIGNATURE[index]) return null;
  }

  let offset = 8;
  let width = null;
  let height = null;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  let privateMetadata = false;

  while (offset < data.byteLength) {
    if (offset + 12 > data.byteLength) return null;
    const length = readU32(data, offset);
    const type = ascii4(data, offset + 4);
    const end = offset + 12 + length;
    if (end > data.byteLength || !/^[A-Za-z]{4}$/.test(type)) return null;

    if (type === "IHDR") {
      if (sawHeader || length !== 13 || offset !== 8) return null;
      width = readU32(data, offset + 8);
      height = readU32(data, offset + 12);
      sawHeader = true;
    }
    if (type === "IDAT") sawData = true;
    if (PNG_PRIVATE_METADATA_CHUNKS.has(type)) privateMetadata = true;
    if (type === "acTL" || type === "fcTL" || type === "fdAT") return null;

    offset = end;
    if (type === "IEND") {
      if (length !== 0) return null;
      sawEnd = true;
      break;
    }
  }

  if (!sawHeader || !sawData || !sawEnd || offset !== data.byteLength) return null;
  if (!validDimensions(width, height)) return null;
  return { mimeType: "image/png", extension: "png", width, height, privateMetadata };
}

function isJpegSof(marker) {
  return marker === 0xc0;
}

function inspectJpeg(data) {
  if (data.byteLength < 12 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  let width = null;
  let height = null;
  let privateMetadata = false;
  let sawFrame = false;
  let sawScan = false;

  while (offset < data.byteLength) {
    if (data[offset] !== 0xff) return null;
    while (offset < data.byteLength && data[offset] === 0xff) offset += 1;
    if (offset >= data.byteLength) return null;
    const marker = data[offset];
    offset += 1;

    if (marker === 0xd9) {
      return sawFrame && sawScan && offset === data.byteLength && validDimensions(width, height)
        ? { mimeType: "image/jpeg", extension: "jpg", width, height, privateMetadata }
        : null;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.byteLength) return null;
    const length = readU16(data, offset);
    if (length < 2 || offset + length > data.byteLength) return null;

    if (JPEG_METADATA_MARKERS.has(marker)) privateMetadata = true;
    if (isJpegSof(marker)) {
      if (length < 8 || sawFrame) return null;
      height = readU16(data, offset + 3);
      width = readU16(data, offset + 5);
      sawFrame = true;
    } else if ((marker >= 0xc1 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return null;
    }

    if (marker === 0xda) {
      if (!sawFrame || sawScan) return null;
      sawScan = true;
      offset += length;
      for (let index = offset; index < data.byteLength - 1; index += 1) {
        if (data[index] === 0xff && data[index + 1] === 0xd9) {
          return index + 2 === data.byteLength && validDimensions(width, height)
            ? { mimeType: "image/jpeg", extension: "jpg", width, height, privateMetadata }
            : null;
        }
      }
      return null;
    }

    offset += length;
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
