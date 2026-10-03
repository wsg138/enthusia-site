import { json, methodNotAllowed, serviceUnavailable } from "../../lib/responses.js";
import { signedStaffGet, staffApiResponse } from "../../lib/staff-api.js";

const SEARCH_PATH = "/v1/public/search";
const MAX_QUERY_LENGTH = 64;

export function isValidSearchQuery(q) {
  return typeof q === "string" && q.trim().length >= 1 && q.length <= MAX_QUERY_LENGTH;
}

export function buildSearchTarget(q) {
  return `${SEARCH_PATH}?q=${encodeURIComponent(q.trim())}`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q");

  if (!isValidSearchQuery(q)) {
    return json({ ok: false, error: "invalid_q" }, 400);
  }

  try {
    const upstream = await signedStaffGet(context.env, buildSearchTarget(q));
    return staffApiResponse(upstream, "public, max-age=30");
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
