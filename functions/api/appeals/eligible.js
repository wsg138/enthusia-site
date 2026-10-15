import { requestEligiblePunishments } from "../../lib/appeal-eligibility.js";
import { authenticateLinkedAppealRequest, linkedMinecraftAccount } from "../../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { staffApiResponse } from "../../lib/staff-api.js";
import { automaticPunishmentAppeals, requestAccountPunishments } from "../../lib/account-punishments.js";

export async function onRequestGet(context) {
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return serviceUnavailable(); }
  if (!session) return unauthorized();
  if (!session.linkedMinecraftAccounts.length) return json({ error: "minecraft_link_required" }, 403);

  const requestedUuid = new URL(context.request.url).searchParams.get("minecraftUuid")
    ?? (session.linkedMinecraftAccounts.length === 1 ? session.linkedMinecraftAccounts[0].uuid : "");
  const account = linkedMinecraftAccount(session, requestedUuid);
  if (!account) return json({ error: "linked_minecraft_account_required" }, 400);

  try {
    if (automaticPunishmentAppeals(context.env)) {
      if (!session.discord?.id) return json({ error: "discord_sign_in_required" }, 403);
      const parameters = new URL(context.request.url).searchParams;
      const scope = parameters.get("includeExpired") === "1" ? "ALL" : "ACTIVE";
      const cursor = parameters.get("cursor");
      if (cursor && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor)) return json({ error: "invalid_punishment_filter" }, 400);
      const page = await requestAccountPunishments(context.env, session, { minecraftUuid: account.uuid, scope, cursor });
      if (page.upstream) return staffApiResponse(page.upstream, "private, no-store");
      return json({ minecraft: { uuid: account.uuid, name: account.name }, punishments: page.punishments,
        nextCursor: page.nextCursor }, 200, { "cache-control": "private, no-store" });
    }
    const eligible = await requestEligiblePunishments(context.env, session.accountId);
    if (eligible.upstream) return staffApiResponse(eligible.upstream, "private, no-store");
    return json({
      minecraft: { uuid: account.uuid, name: account.name },
      punishments: eligible.punishments
    }, 200, { "cache-control": "private, no-store" });
  } catch {
    return serviceUnavailable();
  }
}

export function onRequest() { return methodNotAllowed(["GET"]); }
