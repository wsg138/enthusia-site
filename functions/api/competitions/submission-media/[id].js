import { hasCompetitionDatabase, hasCompetitionMedia } from "../../../lib/competitions/access.js";
import { authorizeCompetitionRead } from "../../../lib/competitions/public-access.js";
import { getPublicSubmissionImage } from "../../../lib/competitions/public-submission-media.js";
import { json, methodNotAllowed } from "../../../lib/responses.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

function mediaId(context) {
  const value = typeof context?.params?.id === "string" ? context.params.id.trim().toLowerCase() : "";
  return isCanonicalUuid(value) ? value : null;
}

export async function onRequestGet(context) {
  const authorized = await authorizeCompetitionRead(context);
  if (authorized.response) return authorized.response;
  const id = mediaId(context);
  if (!id) return json({ error: "media_not_found" }, 404);
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return json({ error: "competition_media_unavailable" }, 503);
  }
  try {
    const media = await getPublicSubmissionImage(context.env.COMPETITIONS_DB, id);
    if (!media) return json({ error: "media_not_found" }, 404);
    const object = await context.env.COMPETITIONS_MEDIA.get(media.storageKey);
    if (!object?.body) return json({ error: "media_not_found" }, 404);
    const headers = new Headers({
      "content-type": media.mimeType,
      "cache-control": "no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff"
    });
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    return new Response(object.body, { status: 200, headers });
  } catch {
    return json({ error: "competition_media_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}

export { mediaId };
