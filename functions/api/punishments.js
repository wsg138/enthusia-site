import { json, methodNotAllowed } from "../lib/responses.js";
import { publicStaffRequest, staffApiResponse } from "../lib/staff-api.js";

const FILTERS = new Set(["ALL", "BAN", "MUTE", "WARNING"]);

export function punishmentQuery(request) {
  const source = new URL(request.url).searchParams;
  const search = String(source.get("q") ?? "").trim();
  if (search) {
    if (search.length > 80) return null;
    return { path: "/v1/public/search", parameters: new URLSearchParams({ q: search }) };
  }

  const filter = String(source.get("type") ?? "ALL").trim().toUpperCase();
  const cursor = String(source.get("cursor") ?? "").trim();
  if (!FILTERS.has(filter) || cursor.length > 128 || (cursor && !/^[A-Za-z0-9_-]+$/.test(cursor))) return null;
  const parameters = new URLSearchParams({ type: filter, limit: "30" });
  if (cursor) parameters.set("cursor", cursor);
  return { path: "/v1/public/punishments", parameters };
}

export async function onRequestGet(context) {
  const query = punishmentQuery(context.request);
  if (!query) return new Response(JSON.stringify({ error: "invalid_punishment_query" }), {
    status: 400,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
  try {
    return staffApiResponse(
      await publicStaffRequest(query.path, query.parameters),
      "public, max-age=20, stale-while-revalidate=40"
    );
  } catch {
    return json({ error: "punishment_service_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
