import { inspectCompetitionImage, sha256Hex } from "./competitions/media-policy.js";
import { isCanonicalUuid } from "./validation.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_DRAFT_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Attachment data must be binary");
}

export function safeAttachmentName(value) {
  const leaf = String(value ?? "attachment").split(/[\\/]/).pop() ?? "attachment";
  const cleaned = leaf.normalize("NFKC").replace(/[\u0000-\u001F\u007F]/g, "").trim();
  return (cleaned || "attachment").slice(0, 120);
}

function textInspection(data, requestedType, fileName) {
  const extensionAllowed = /\.(?:txt|log)$/i.test(fileName);
  const typeAllowed = ["", "text/plain", "application/octet-stream"].includes(requestedType);
  if (!extensionAllowed && !typeAllowed) return null;
  if (!data.byteLength || data.byteLength > MAX_TEXT_BYTES) {
    return { ok: false, error: data.byteLength ? "attachment_too_large" : "attachment_empty" };
  }
  let value;
  try { value = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { return null; }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) return null;
  return { ok: true, mimeType: "text/plain", extension: "txt", width: null, height: null, byteSize: data.byteLength };
}

export function inspectAppealAttachment(value, requestedType = "", fileName = "attachment") {
  const data = asBytes(value);
  const normalizedType = String(requestedType).split(";", 1)[0].trim().toLowerCase();
  if (!data.byteLength) return { ok: false, error: "attachment_empty" };
  if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "attachment_too_large" };
  const image = inspectCompetitionImage(data);
  if (image.ok) {
    if (!["", "application/octet-stream", image.mimeType].includes(normalizedType)) {
      return { ok: false, error: "attachment_type_mismatch" };
    }
    return image;
  }
  if (image.error !== "unsupported_or_invalid_image") return image;
  return textInspection(data, normalizedType, safeAttachmentName(fileName))
    ?? { ok: false, error: "unsupported_attachment_type" };
}

export function appealAttachmentKey(draftId, attachmentId, extension) {
  const draft = String(draftId ?? "").trim().toLowerCase();
  const attachment = String(attachmentId ?? "").trim().toLowerCase();
  if (!isCanonicalUuid(draft) || !isCanonicalUuid(attachment)) throw new TypeError("Attachment identifier is invalid");
  if (!new Set(["png", "jpg", "txt"]).has(extension)) throw new TypeError("Attachment extension is invalid");
  return `appeals/${draft}/${attachment}.${extension}`;
}

function attachmentStorageOptions(inspection, sha256) {
  return {
    httpMetadata: { contentType: inspection.mimeType, cacheControl: "private, no-store" },
    customMetadata: { sha256, purpose: "appeal-evidence" },
    sha256
  };
}

function storedAttachment(stored, binary, inspection, key, sha256) {
  return {
    key,
    sha256,
    byteSize: stored?.size ?? binary.byteLength,
    mimeType: inspection.mimeType,
    width: inspection.width ?? null,
    height: inspection.height ?? null
  };
}

export async function storeAppealAttachment(bucket, {
  data,
  draftId,
  attachmentId,
  inspection
}) {
  if (!bucket || typeof bucket.put !== "function" || !inspection?.ok) {
    throw new TypeError("Appeal attachment storage is unavailable");
  }
  const binary = asBytes(data);
  const sha256 = await sha256Hex(binary);
  const key = appealAttachmentKey(draftId, attachmentId, inspection.extension);
  const stored = await bucket.put(key, binary, attachmentStorageOptions(inspection, sha256));
  return storedAttachment(stored, binary, inspection, key, sha256);
}

export async function deleteAppealAttachment(bucket, key) {
  if (!bucket || typeof bucket.delete !== "function") throw new TypeError("Appeal attachment storage is unavailable");
  if (typeof key !== "string" || !/^appeals\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|txt)$/.test(key)) {
    throw new TypeError("Appeal attachment key is invalid");
  }
  await bucket.delete(key);
}

function cleanupError(error) {
  if (error instanceof Error && error.message) return error.message.slice(0, 160);
  return "unknown storage error";
}

export async function cleanupAppealAttachment(context, bucket, key) {
  try {
    await deleteAppealAttachment(bucket, key);
  } catch (initialError) {
    const retry = deleteAppealAttachment(bucket, key).catch((retryError) => {
      console.error("Appeal attachment cleanup failed after retry", {
        initialError: cleanupError(initialError),
        retryError: cleanupError(retryError)
      });
    });
    if (typeof context?.waitUntil === "function") context.waitUntil(retry);
    else await retry;
  }
}

export function appealAttachmentLimits() {
  return Object.freeze({
    maxAttachments: MAX_ATTACHMENTS,
    maxImageBytes: MAX_IMAGE_BYTES,
    maxTextBytes: MAX_TEXT_BYTES,
    maxDraftBytes: MAX_DRAFT_BYTES,
    acceptedTypes: Object.freeze(["image/png", "image/jpeg", "text/plain"])
  });
}
