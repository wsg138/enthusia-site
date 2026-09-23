const VISIBILITY_MODES = new Set(["PUBLIC", "UNLISTED", "STAFF_ONLY"]);

export function sanitizeCompetitionVisibility(value, fallback = "PUBLIC") {
  if (value === null || value === undefined || value === "") return fallback;
  return typeof value === "string" && VISIBILITY_MODES.has(value) ? value : null;
}

export function isPubliclyReachableVisibility(value) {
  return value === "PUBLIC" || value === "UNLISTED";
}

export function isPubliclyListedVisibility(value) {
  return value === "PUBLIC";
}
