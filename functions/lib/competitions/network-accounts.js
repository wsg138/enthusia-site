import { signedStaffRequest } from "../staff-api.js";
import { isCanonicalUuid } from "../validation.js";

export function networkAccountsEnabled(env) {
  return String(env?.NETWORK_ACCOUNT_LINKS ?? "").trim().toLowerCase() === "true";
}

export function normalizeNetworkAccounts(payload) {
  if (!Array.isArray(payload?.accounts) || payload.accounts.length > 100) {
    throw new Error("Invalid network account list");
  }
  const seen = new Set();
  return payload.accounts.map((account) => {
    const uuid = String(account?.uuid ?? "").toLowerCase();
    const name = String(account?.name ?? "");
    const linkedAt = String(account?.linkedAt ?? "");
    // Authoritative names include Floodgate prefixes; ownership uses the UUID.
    if (!isCanonicalUuid(uuid) || !name.trim() || name.length > 32 || /[<>]|\p{C}/u.test(name)
        || !Number.isFinite(Date.parse(linkedAt)) || seen.has(uuid)) {
      throw new Error("Invalid network account identity");
    }
    seen.add(uuid);
    return { uuid, name, linkedAt };
  });
}

export async function refreshNetworkAccounts(db, env, discordUserId) {
  const response = await signedStaffRequest(env, "/v1/website/accounts", { discordUserId });
  if (!response.ok) throw new Error("Network account service unavailable");
  const accounts = normalizeNetworkAccounts(await response.json());
  const now = new Date().toISOString();
  const placeholders = accounts.map(() => "?").join(",");
  const statements = [db.prepare(`DELETE FROM competition_minecraft_links WHERE discord_user_id = ?
    ${accounts.length ? `AND minecraft_uuid NOT IN (${placeholders})` : ""}`)
    .bind(discordUserId, ...accounts.map((account) => account.uuid))];
  for (const account of accounts) {
    statements.push(db.prepare(`INSERT INTO competition_minecraft_links
      (minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(minecraft_uuid) DO UPDATE SET discord_user_id = excluded.discord_user_id,
        minecraft_name = excluded.minecraft_name, linked_at = excluded.linked_at, updated_at = excluded.updated_at
      WHERE competition_minecraft_links.discord_user_id <> excluded.discord_user_id
        OR competition_minecraft_links.minecraft_name <> excluded.minecraft_name
        OR competition_minecraft_links.linked_at <> excluded.linked_at`)
      .bind(account.uuid, discordUserId, account.name, account.linkedAt, now));
  }
  await db.batch(statements);
  return accounts;
}

export async function networkLinkRequest(env, discordUserId, input) {
  const response = await signedStaffRequest(env, "/v1/website/accounts/link", {
    discordUserId,
    action: input.action,
    ...(input.action === "POLL" ? { requestId: input.requestId } : {})
  });
  if (!response.ok) throw new Error("Network account linking unavailable");
  return response.json();
}
