import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import { getCompetitionIdentitySession } from "../../../lib/competitions/identity.js";
import { json, methodNotAllowed } from "../../../lib/responses.js";
import { automaticPunishmentAppeals } from "../../../lib/account-punishments.js";

export async function onRequestGet(context) {
  if (!competitionsEnabled(context.env)) return json({ error: "not_found" }, 404);
  if (!hasCompetitionDatabase(context.env)) return json({ error: "competition_database_unavailable" }, 503);
  try {
    const session = await getCompetitionIdentitySession(context.request, context.env.COMPETITIONS_DB, undefined, context.env);
    if (!session) return json({ authenticated: false });
    return json({
      authenticated: true,
      accountSubject: session.subject,
      discord: session.discord,
      discordGuildMember: session.discordGuildMember,
      linkedMinecraftAccounts: session.linkedMinecraftAccounts,
      networkAccounts: session.networkAccounts,
      linkedPunishmentAppeals: automaticPunishmentAppeals(context.env),
      networkAccountsPending: String(context.env.NETWORK_ACCOUNT_LINKS ?? "").trim().toLowerCase() === "false",
      expiresAt: session.expiresAt
    });
  } catch {
    return json({ error: "competition_identity_unavailable" }, 503);
  }
}

export function onRequest() {
  return methodNotAllowed(["GET"]);
}
