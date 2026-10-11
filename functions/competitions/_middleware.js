import { authenticateRequest } from "../lib/auth.js";
import {
  canPreviewCompetitions,
  competitionsEnabled,
  competitionsPublicAccessEnabled
} from "../lib/competitions/access.js";

export async function onRequest(context) {
  if (!competitionsEnabled(context.env)) {
    return new Response("Not found", { status: 404 });
  }

  if (competitionsPublicAccessEnabled(context.env)) {
    return context.next();
  }

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (!canPreviewCompetitions(session, context.env)) {
    return new Response("Not found", { status: 404 });
  }

  return context.next();
}
