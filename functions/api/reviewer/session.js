import { authenticateRequest, canReview } from "../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled
} from "../../lib/competitions/access.js";
import { json, methodNotAllowed, unauthorized } from "../../lib/responses.js";

export function staffCapabilities(session, env) {
  return Object.freeze({
    appeals: canReview(session, env),
    competitions: competitionsEnabled(env) && canManageCompetitions(session, env)
  });
}

export async function onRequestGet(context) {
  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return unauthorized();
  }
  return json(staffCapabilities(session, context.env));
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
