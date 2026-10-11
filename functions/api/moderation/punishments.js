import { json, methodNotAllowed, serviceUnavailable } from "../../lib/responses.js";
import { signedStaffGet, staffApiResponse } from "../../lib/staff-api.js";

const PUNISHMENTS_PATH = "/v1/public/punishments";
const MAX_TYPE_LENGTH = 32;
const MAX_CURSOR_LENGTH = 256;
const DEFAULT_LIMIT = 30;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

export function clampLimit(raw) {
  if (raw === null || raw === undefined || raw === "") return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);
}

/**
 * Build the plugin request target for /v1/public/punishments.
 * The plugin signs rawPath + "?" + rawQuery, so the query string must be built
 * here in the exact form that is sent: fixed key order (type, cursor, limit),
 * only present params included.
 */
export function buildPunishmentsTarget(params = {}) {
  const { type, cursor, limit } = params;
  const query = new URLSearchParams();
  if (typeof type === "string" && type.length > 0) query.set("type", type);
  if (typeof cursor === "string" && cursor.length > 0) query.set("cursor", cursor);
  query.set("limit", String(clampLimit(limit)));
  const queryString = query.toString();
  return queryString ? `${PUNISHMENTS_PATH}?${queryString}` : PUNISHMENTS_PATH;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  const type = url.searchParams.get("type");
  if (type !== null && type.length > MAX_TYPE_LENGTH) {
    return json({ ok: false, error: "invalid_type" }, 400);
  }

  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && cursor.length > MAX_CURSOR_LENGTH) {
    return json({ ok: false, error: "invalid_cursor" }, 400);
  }

  const target = buildPunishmentsTarget({
    type,
    cursor,
    limit: url.searchParams.get("limit")
  });

  try {
    const upstream = await signedStaffGet(context.env, target);
    return staffApiResponse(upstream, "public, max-age=60");
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
