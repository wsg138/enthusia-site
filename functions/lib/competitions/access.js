function normalizeRoleList(value, fallback) {
  return String(value ?? fallback)
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

function hasAllowedRole(session, allowedRoles) {
  if (!session || !Array.isArray(session.roles)) return false;
  const allowed = new Set(allowedRoles);
  return session.roles.some((role) => allowed.has(String(role).toLowerCase()));
}

export function competitionsEnabled(env) {
  return String(env?.COMPETITIONS_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function competitionManagerRoles(env) {
  return normalizeRoleList(env?.COMPETITIONS_MANAGER_ROLES, "founder,admin");
}

export function competitionModeratorRoles(env) {
  return normalizeRoleList(
    env?.COMPETITIONS_MODERATOR_ROLES,
    "founder,admin,moderator,developer"
  );
}

export function canManageCompetitions(session, env) {
  return hasAllowedRole(session, competitionManagerRoles(env));
}

export function canModerateCompetitions(session, env) {
  return hasAllowedRole(session, competitionModeratorRoles(env));
}

export function hasCompetitionDatabase(env) {
  return Boolean(env?.COMPETITIONS_DB && typeof env.COMPETITIONS_DB.prepare === "function");
}

export function hasCompetitionMedia(env) {
  return Boolean(env?.COMPETITIONS_MEDIA && typeof env.COMPETITIONS_MEDIA.get === "function");
}
