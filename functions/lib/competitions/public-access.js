import { authenticateRequest } from "../auth.js";
import {
  canPreviewCompetitions,
  competitionsEnabled,
  competitionsPublicAccessEnabled
} from "./access.js";
import { json } from "../responses.js";

export async function authorizeCompetitionRead(context, authenticator = authenticateRequest) {
  if (!competitionsEnabled(context.env)) {
    return { response: json({ error: "not_found" }, 404) };
  }

  if (competitionsPublicAccessEnabled(context.env)) {
    return { publicAccess: true, session: null };
  }

  let session;
  try {
    session = await authenticator(context.request, context.env);
  } catch {
    return { response: json({ error: "not_found" }, 404) };
  }

  if (!canPreviewCompetitions(session, context.env)) {
    return { response: json({ error: "not_found" }, 404) };
  }

  return { publicAccess: false, session };
}
