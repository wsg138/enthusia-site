import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import { getCompetitionIdentitySession } from "../../../lib/competitions/identity.js";
import { json, methodNotAllowed } from "../../../lib/responses.js";

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  try {
    const session = await getCompetitionIdentitySession(context.request, context.env.COMPETITIONS_DB);
    if (!session) return json({ authenticated: false });
    return json({
      authenticated: true,
      accountSubject: session.subject,
      discord: session.discord,
      discordGuildMember: session.discordGuildMember,
      linkedMinecraftAccounts: session.linkedMinecraftAccounts,
      expiresAt: session.expiresAt
    });
  } catch {
    return json({ error: "competition_identity_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
