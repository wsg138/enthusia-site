import { signedStaffRequest } from "./staff-api.js";
import { linkedMinecraftAccount } from "./appeal-session.js";
import { sanitizeAppealCandidate } from "./appeal-eligibility.js";

export function automaticPunishmentAppeals(env) {
  return String(env?.LINKED_PUNISHMENT_APPEALS ?? "").trim().toLowerCase() === "true";
}

function instant(value) {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("Invalid punishment timestamp");
  return value;
}

export async function requestAccountPunishments(env, session, { minecraftUuid = null, scope = "ACTIVE", cursor = null } = {}) {
  if (!session?.discord?.id) throw new Error("Discord identity is required for linked punishments");
  if (!new Set(["ACTIVE", "EXPIRED", "ALL"]).has(scope)) throw new Error("Invalid punishment scope");
  if (minecraftUuid && !linkedMinecraftAccount(session, minecraftUuid)) throw new Error("Minecraft ownership is required");
  if (cursor && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(cursor))) throw new Error("Invalid punishment cursor");
  const upstream = await signedStaffRequest(env, "/v1/website/appeals/linked", {
    discordUserId: session.discord.id,
    scope,
    ...(minecraftUuid ? { minecraftUuid } : {}),
    ...(cursor ? { cursor } : {})
  });
  if (!upstream.ok) return { upstream };
  const body = await upstream.json();
  if (!Array.isArray(body?.punishments) || body.punishments.length > 100) throw new Error("Invalid owned punishment list");
  const punishments = body.punishments.map((row) => {
    const item = sanitizeAppealCandidate(row);
    const account = linkedMinecraftAccount(session, row.minecraftUuid);
    if (!item || !account || (minecraftUuid && account.uuid !== minecraftUuid)
        || typeof row.active !== "boolean" || typeof row.appealable !== "boolean") {
      throw new Error("Invalid punishment ownership response");
    }
    return { ...item, createdAt: instant(item.createdAt), minecraftUuid: account.uuid,
      minecraftName: account.name, active: row.active, appealable: row.appealable,
      expiresAt: instant(row.expiresAt), nextAppealAt: instant(row.nextAppealAt) };
  });
  const nextCursor = body.nextCursor ?? null;
  if (nextCursor !== null && !/^[A-Za-z0-9_-]{1,256}$/.test(nextCursor)) throw new Error("Invalid punishment cursor");
  return { upstream: null, punishments, nextCursor };
}
