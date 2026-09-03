import { requestEligiblePunishments } from "../../lib/appeal-eligibility.js";
import { authenticateLinkedAppealRequest, linkedMinecraftAccount } from "../../lib/appeal-session.js";
import { json, methodNotAllowed, serviceUnavailable, unauthorized } from "../../lib/responses.js";
import { staffApiResponse } from "../../lib/staff-api.js";

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
    const eligible = await requestEligiblePunishments(context.env, account.uuid);
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
