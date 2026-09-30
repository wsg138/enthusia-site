import { json, methodNotAllowed } from "../../lib/responses.js";
import { turnstileSiteKey } from "../../lib/turnstile.js";

export function onRequestGet(context) {
  try {
    return json({ siteKey: turnstileSiteKey(context.env), action: "appeal_claim" }, 200, {
      "cache-control": "public, max-age=300"
    });
  } catch {
    return json({ error: "turnstile_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
