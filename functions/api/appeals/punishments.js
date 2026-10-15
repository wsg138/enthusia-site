import { automaticPunishmentAppeals, requestAccountPunishments } from "../../lib/account-punishments.js";
import { authenticateLinkedAppealRequest, linkedMinecraftAccount } from "../../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { staffApiResponse } from "../../lib/staff-api.js";

export async function onRequestGet(context) {
  if (!automaticPunishmentAppeals(context.env)) return json({ error: "not_found" }, 404);
  let session;
  try { session = await authenticateLinkedAppealRequest(context.request, context.env); }
  catch { return serviceUnavailable(); }
  if (!session) return unauthorized();
  if (!session.discord?.id) return json({ error: "discord_sign_in_required" }, 403);
  if (!session.linkedMinecraftAccounts.length) return json({ error: "minecraft_link_required" }, 403);
  const parameters = new URL(context.request.url).searchParams;
  const minecraftUuid = parameters.get("minecraftUuid");
  const scope = (parameters.get("scope") ?? "ACTIVE").toUpperCase();
  const cursor = parameters.get("cursor");
  if ((minecraftUuid && !linkedMinecraftAccount(session, minecraftUuid))
      || !["ACTIVE", "EXPIRED", "ALL"].includes(scope)
      || (cursor && !/^[A-Za-z0-9_-]{1,256}$/.test(cursor))) return json({ error: "invalid_punishment_filter" }, 400);
  try {
    const page = await requestAccountPunishments(context.env, session, { minecraftUuid, scope, cursor });
    if (page.upstream) return staffApiResponse(page.upstream, "private, no-store");
    return json({ punishments: page.punishments, nextCursor: page.nextCursor }, 200, { "cache-control": "private, no-store" });
  } catch { return serviceUnavailable(); }
}

export function onRequest() { return methodNotAllowed(["GET"]); }
