import { authenticateRequest } from "../../lib/auth.js";
import {
  canManageCompetitions,
  competitionsEnabled
} from "../../lib/competitions/access.js";

import { NetworkAccountLookupError } from "../../lib/competitions/network-accounts.js";

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
  } catch (error) {
    if (error instanceof NetworkAccountLookupError) {
      return new Response("You are signed in, but the site cannot verify your linked Minecraft account right now. Please try again shortly.", {
        status: 503,
        headers: { "cache-control": "private, no-store", "content-type": "text/plain; charset=utf-8", "retry-after": "60" }
      });
    }
    return hidden();
  }

  if (!canManageCompetitions(session, context.env)) return hidden();
  return context.next();
}
