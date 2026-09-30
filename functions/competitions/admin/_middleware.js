import { authenticateRequest } from "../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled
} from "../../lib/competitions/access.js";

function hidden() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex, nofollow, noarchive"
    }
  });
}

export async function onRequest(context) {
  if (!competitionsEnabled(context.env)) return hidden();

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return hidden();
  }

  if (!canManageCompetitions(session, context.env)) return hidden();
  return context.next();
}
