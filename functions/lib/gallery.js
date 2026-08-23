import { getCompetitionIdentitySession } from "./competitions/identity.js";

export const GALLERY_CATEGORIES = Object.freeze([
  "COMMUNITY_BUILDS", "PVP", "BETA_1", "BETA_2", "BETA_3", "MAPART"
]);
export const SUBMITTABLE_CATEGORIES = new Set(["COMMUNITY_BUILDS", "MAPART"]);

function ids(env, name) {
  return new Set(String(env?.[name] ?? "").split(",").map((v) => v.trim()).filter((v) => /^\d{16,22}$/.test(v)));
}

export function galleryStaffAccess(session, env) {
  const checkedAt = Date.parse(session?.discordRolesCheckedAt ?? "");
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 60 * 60 * 1000) {
    return { review: false, manage: false, reauthenticationRequired: true };
  }
  const roles = new Set(session?.guildRoleIds ?? []);
  const helper = ids(env, "DISCORD_HELPER_ROLE_IDS");
  const moderator = ids(env, "DISCORD_MODERATOR_ROLE_IDS");
  const developer = ids(env, "DISCORD_DEVELOPER_ROLE_IDS");
  const admin = ids(env, "DISCORD_ADMIN_ROLE_IDS");
  const founder = ids(env, "DISCORD_FOUNDER_ROLE_IDS");
  const has = (set) => [...set].some((id) => roles.has(id));
  const manage = has(developer) || has(admin) || has(founder);
  return { review: manage || has(helper) || has(moderator), manage, reauthenticationRequired: false };
}

export async function gallerySession(context) {
  if (!context.env?.COMPETITIONS_DB) return null;
  return getCompetitionIdentitySession(context.request, context.env.COMPETITIONS_DB);
}

export function cleanGalleryText(value, max) {
  const text = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text && text.length <= max ? text : null;
}

export async function galleryEvent(db, submissionId, eventType, actorId, detail = {}, now = new Date().toISOString()) {
  return db.prepare(`INSERT INTO gallery_submission_events
    (id, submission_id, event_type, actor_discord_id, detail_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), submissionId, eventType, actorId, JSON.stringify(detail), now).run();
}
