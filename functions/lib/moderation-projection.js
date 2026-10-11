import { sanitizePublicPunishment, sanitizePublicPunishmentCollection } from "./public-punishment.js";
import { json } from "./responses.js";
import { staffApiResponse } from "./staff-api.js";

export async function publicModerationResponse(upstream, mode, cacheControl) {
  if (!upstream.ok) return staffApiResponse(upstream, "no-store");
  const payload = await upstream.json();
  const projected = mode === "case"
    ? sanitizePublicPunishment(payload)
    : sanitizePublicPunishmentCollection(payload, mode === "list");
  if (!projected) return json({ error: "invalid_punishment_projection" }, 502);
  return json(projected, 200, { "cache-control": cacheControl });
}
