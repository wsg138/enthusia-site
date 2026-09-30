import { authenticateRequest } from "../../../../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled,
  hasCompetitionDatabase,
  hasCompetitionMedia
} from "../../../../../lib/competitions/access.js";
import { getCompetitionMediaForManager } from "../../../../../lib/competitions/media-repository.js";
import { json, methodNotAllowed, unauthorized } from "../../../../../lib/responses.js";
import { isCanonicalUuid } from "../../../../../lib/validation.js";

function canonicalParam(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return isCanonicalUuid(normalized) ? normalized : null;
}

async function authorizeManager(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return { response: unauthorized() };
  }
  if (!canManageCompetitions(session, context.env)) {
    return { response: json({ error: "competition_manager_required" }, 403) };
  }
  if (!hasCompetitionDatabase(context.env) || !hasCompetitionMedia(context.env)) {
    return { response: json({ error: "competition_media_unavailable" }, 503) };
  }
  return { session };
}

export async function onRequestGet(context) {
  const competitionId = canonicalParam(context?.params?.id);
  const mediaId = canonicalParam(context?.params?.mediaId);
  if (!competitionId || !mediaId) return json({ error: "media_not_found" }, 404);

  const authorized = await authorizeManager(context);
  if (authorized.response) return authorized.response;

  try {
    const media = await getCompetitionMediaForManager(
      context.env.COMPETITIONS_DB,
      competitionId,
      mediaId
    );
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
