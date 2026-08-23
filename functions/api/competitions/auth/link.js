import { competitionsEnabled, hasCompetitionDatabase } from "../../../lib/competitions/access.js";
import {
  competitionLinkStatus,
  consumeCompetitionLinkCode,
  registerCompetitionLinkCode
} from "../../../lib/competitions/bridge.js";
import {
  consumeMinecraftLinkCode,
  createMinecraftLinkCode,
  getActiveLinkCode,
  getCompetitionIdentitySession,
  unlinkMinecraftAccount
} from "../../../lib/competitions/identity.js";
import { json, methodNotAllowed, unauthorized } from "../../../lib/responses.js";
import { requireSameOrigin } from "../../../lib/security.js";
import { isCanonicalUuid } from "../../../lib/validation.js";

async function authorize(context) {
  if (!competitionsEnabled(context.env)) return { response: json({ error: "not_found" }, 404) };
  if (!hasCompetitionDatabase(context.env)) return { response: json({ error: "competition_database_unavailable" }, 503) };
  try {
    const session = await getCompetitionIdentitySession(context.request, context.env.COMPETITIONS_DB);
    return session ? { session } : { response: unauthorized() };
  } catch {
    return { response: json({ error: "competition_identity_unavailable" }, 503) };
  }
}

export async function onRequestPost(context) {
  if (!requireSameOrigin(context.request)) return json({ error: "invalid_origin" }, 403);
  const authorized = await authorize(context);
  if (authorized.response) return authorized.response;
  let input;
  try { input = await context.request.json(); } catch { input = null; }
  const action = input?.action;

  if (action === "START") {
    try {
      const link = await createMinecraftLinkCode(
        context.env.COMPETITIONS_DB,
        authorized.session.discord.id
      );
      try {
        await registerCompetitionLinkCode(context.env, link.codeHash, link.expiresAt);
      } catch (error) {
        await context.env.COMPETITIONS_DB.prepare(
          "DELETE FROM competition_link_codes WHERE code_hash = ? AND discord_user_id = ?"
        ).bind(link.codeHash, authorized.session.discord.id).run().catch(() => {});
        throw error;
      }
      return json({
        status: "WAITING_FOR_MINECRAFT",
        code: link.code,
        requestId: link.codeHash,
        expiresAt: link.expiresAt,
        command: `/competitionlink ${link.code}`
      });
    } catch {
      return json({ error: "minecraft_link_start_failed" }, 503);
    }
  }

  if (action === "POLL") {
    const requestId = typeof input?.requestId === "string" ? input.requestId.trim() : "";
    if (!requestId || requestId.length > 128) return json({ error: "invalid_link_request" }, 400);
    try {
      const active = await getActiveLinkCode(
        context.env.COMPETITIONS_DB,
        authorized.session.discord.id,
        requestId
      );
      if (!active) return json({ status: "EXPIRED_OR_USED" }, 410);
      const bridge = await competitionLinkStatus(context.env, requestId);
      if (bridge.status === "PENDING") return json({ status: "WAITING_FOR_MINECRAFT", expiresAt: active.expiresAt });
      if (bridge.status !== "CLAIMED") return json({ error: "invalid_link_bridge_status" }, 503);
      const linked = await consumeMinecraftLinkCode(context.env.COMPETITIONS_DB, {
        discordUserId: authorized.session.discord.id,
        codeHash: requestId,
        minecraftUuid: bridge.minecraftUuid,
        minecraftName: bridge.minecraftName
      });
      if (linked.status === "MINECRAFT_ALREADY_LINKED") {
        return json({ error: "minecraft_account_linked_to_another_discord" }, 409);
      }
      if (!["LINKED", "ALREADY_LINKED_TO_YOU"].includes(linked.status)) {
        return json({ error: "minecraft_link_commit_conflict", status: linked.status }, 409);
      }
      await consumeCompetitionLinkCode(context.env, requestId).catch(() => {});
      return json({ status: linked.status, minecraft: { uuid: linked.uuid, name: linked.name } });
    } catch (error) {
      if (String(error?.message ?? error).includes("minecraft_identity_locked_to_another_discord")) {
        return json({ error: "minecraft_identity_locked_to_another_discord" }, 409);
      }
      return json({ error: "minecraft_link_poll_failed" }, 503);
    }
  }

  if (action === "UNLINK") {
    const minecraftUuid = String(input?.minecraftUuid ?? "").trim().toLowerCase();
    if (!isCanonicalUuid(minecraftUuid)) return json({ error: "invalid_minecraft_account" }, 400);
    try {
      const removed = await unlinkMinecraftAccount(
        context.env.COMPETITIONS_DB,
        authorized.session.discord.id,
        minecraftUuid
      );
      return removed ? json({ status: "UNLINKED", minecraftUuid }) : json({ error: "minecraft_link_not_found" }, 404);
    } catch {
      return json({ error: "minecraft_unlink_failed" }, 503);
    }
  }

  return json({ error: "invalid_link_action" }, 400);
}

export function onRequest() {
  return methodNotAllowed(["POST"]);
}
