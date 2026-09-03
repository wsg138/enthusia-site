import { inspectCompetitionImage, sha256Hex } from "./media-policy.js";
import { moderateImageDataUrl } from "./moderation.js";

const MEDIA_PURPOSES = new Set(["submission", "banner", "gallery", "icon", "category"]);

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Image data must be binary");
}

function requireBucket(bucket) {
  if (!bucket || typeof bucket.put !== "function") {
    throw new TypeError("Competition media bucket is unavailable");
  }
  return bucket;
}

function safeId(value, label) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw new TypeError(`${label} must be a canonical UUID`);
  }
  return text;
}

function bytesToBase64(value) {
  const data = asBytes(value);
  let binary = "";
  const chunkSize = 0x4000;
  for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, data.byteLength);
    for (let index = offset; index < end; index += 1) binary += String.fromCharCode(data[index]);
  }
  return btoa(binary);
}

export function competitionMediaKey({ competitionId, mediaId, extension, purpose = "submission" }) {
  const competition = safeId(competitionId, "Competition ID");
  const media = safeId(mediaId, "Media ID");
  if (!new Set(["png", "jpg"]).has(extension)) throw new TypeError("Unsupported image extension");
  if (!MEDIA_PURPOSES.has(purpose)) throw new TypeError("Unsupported media purpose");
  return `competitions/${competition}/${purpose}/${media}.${extension}`;
}

export function galleryMediaKey({ mediaId, extension }) {
  const media = safeId(mediaId, "Gallery media ID");
  if (!new Set(["png", "jpg"]).has(extension)) throw new TypeError("Unsupported image extension");
  return `gallery/submissions/${media}.${extension}`;
}

export async function prepareGalleryImage({ data, mediaId, env, fetchImpl = fetch }) {
  const prepared = await prepareCompetitionImage({ data, competitionId: mediaId, mediaId, env, fetchImpl });
  if (prepared.status === "READY") prepared.key = galleryMediaKey({ mediaId, extension: prepared.inspection.extension });
  return prepared;
}

export async function deleteGalleryImage(bucket, key) {
  if (!bucket || typeof bucket.delete !== "function") throw new TypeError("Gallery media bucket is unavailable");
  if (typeof key !== "string" || !/^gallery\/submissions\/[0-9a-f-]{36}\.(?:png|jpg)$/.test(key)) {
    throw new TypeError("Gallery media key is invalid");
  }
  await bucket.delete(key);
}

export async function prepareCompetitionImage({ data, competitionId, mediaId, purpose = "submission", env, fetchImpl = fetch }) {
  const binary = asBytes(data);
  const inspection = inspectCompetitionImage(binary);
  if (!inspection.ok) {
    return { status: "REJECTED", error: inspection.error, inspection: null, moderation: null };
  }

  const hash = await sha256Hex(binary);
  const dataUrl = `data:${inspection.mimeType};base64,${bytesToBase64(binary)}`;
  const moderation = await moderateImageDataUrl(dataUrl, env, fetchImpl);
  if (moderation.outcome !== "PASSED") {
    return {
      status: moderation.outcome === "BLOCKED" ? "BLOCKED" : "ERROR",
      error: moderation.error,
      inspection,
      moderation,
      sha256: hash
    };
  }

  return {
    status: "READY",
    error: null,
    data: binary,
    inspection,
    moderation,
    sha256: hash,
    key: competitionMediaKey({
      competitionId,
      mediaId,
      extension: inspection.extension,
      purpose
    })
  };
}

export async function storePreparedCompetitionImage(bucket, prepared) {
  const mediaBucket = requireBucket(bucket);
  if (!prepared || prepared.status !== "READY" || !prepared.data || !prepared.key) {
    throw new TypeError("Only prepared competition images can be stored");
  }

  const result = await mediaBucket.put(prepared.key, prepared.data, {
    httpMetadata: {
      contentType: prepared.inspection.mimeType,
      cacheControl: "private, no-store"
    },
    customMetadata: {
      sha256: prepared.sha256,
      width: String(prepared.inspection.width),
      height: String(prepared.inspection.height),
      moderationProvider: prepared.moderation.provider,
      moderationModel: prepared.moderation.model,
      moderationOutcome: prepared.moderation.outcome
    },
    sha256: prepared.sha256
  });

  return {
    key: prepared.key,
    etag: result?.etag ?? null,
    size: result?.size ?? prepared.data.byteLength,
    mimeType: prepared.inspection.mimeType,
    width: prepared.inspection.width,
    height: prepared.inspection.height,
    sha256: prepared.sha256,
    moderation: prepared.moderation
  };
}

export async function deleteCompetitionImage(bucket, key) {
  if (!bucket || typeof bucket.delete !== "function") {
    throw new TypeError("Competition media bucket is unavailable");
  }
  if (typeof key !== "string" || !/^competitions\/[0-9a-f-]{36}\/(?:submission|banner|gallery|icon|category)\/[0-9a-f-]{36}\.(?:png|jpg)$/.test(key)) {
    throw new TypeError("Competition media key is invalid");
  }
  await bucket.delete(key);
}
