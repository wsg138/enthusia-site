import { listPunishmentBindings } from "../../lib/appeal-bindings.js";
import { authenticateLinkedAppealRequest } from "../../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";

export async function onRequestGet(context) {
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return serviceUnavailable(); }
  if (!session) return unauthorized();

  try {
    return json(
      { bindings: await listPunishmentBindings(context.env?.COMPETITIONS_DB, session.subject) },
      200,
      { "cache-control": "private, no-store" }
    );
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
