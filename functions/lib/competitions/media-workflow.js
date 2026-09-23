import {
  deleteCompetitionImage,
  storePreparedCompetitionImage
} from "./media-storage.js";
import { json } from "../responses.js";

export function imageBodyFailureResponse(error) {
  const code = String(error?.message ?? "invalid_image");
  return json({ error: code }, code === "image_too_large" ? 413 : 400);
}

export function preparedImageFailureResponse(prepared) {
  if (prepared.status === "REJECTED") {
    return json({ error: prepared.error || "invalid_image" }, 400);
  }
  if (prepared.status === "BLOCKED") {
    return json({ error: "image_blocked_by_moderation" }, 422);
  }
  if (prepared.status !== "READY") {
    return json({ error: "image_moderation_unavailable" }, 503);
  }
  return null;
}

export async function storePreparedUpload(bucket, prepared) {
  try {
    return { stored: await storePreparedCompetitionImage(bucket, prepared) };
  } catch {
    return { response: json({ error: "competition_media_storage_failed" }, 503) };
  }
}

export async function cleanupStoredUpload(bucket, key) {
  try {
    await deleteCompetitionImage(bucket, key);
  } catch {
    // Cleanup is best-effort; callers must preserve the primary database response.
  }
}

export async function privateStoredImageResponse(bucket, image) {
  try {
    const object = await bucket.get(image.storageKey);
    if (!object?.body) return json({ error: "image_not_found" }, 404);
    const headers = new Headers({
      "content-type": image.mimeType,
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff"
    });
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  } catch {
    return json({ error: "competition_media_unavailable" }, 503);
  }
}
