import { getCompetitionIdentitySession } from "./competitions/identity.js";
import { discordRoleSnapshotIsFresh, discordStaffRoles } from "./auth.js";

export const GALLERY_CATEGORIES = Object.freeze([
  "COMMUNITY_BUILDS", "PVP", "BETA_1", "BETA_2", "BETA_3", "MAPART"
]);
export const SUBMITTABLE_CATEGORIES = new Set(["COMMUNITY_BUILDS", "MAPART"]);

export function galleryStaffAccess(session, env) {
  if (!discordRoleSnapshotIsFresh(session)) {
    return { review: false, manage: false, reauthenticationRequired: true };
  }
  const roles = new Set(discordStaffRoles(session, env));
  const manage = roles.has("developer") || roles.has("admin") || roles.has("founder");
  return {
    review: manage || roles.has("helper") || roles.has("moderator"),
    manage,
    reauthenticationRequired: false
  };
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
