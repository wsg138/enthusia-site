import { pruneCompetitionIdentityState } from "./identity.js";
import { canTransitionCompetition } from "./lifecycle.js";
import { drainCompetitionNotifications } from "./notification-delivery.js";
import { recoverStaleCompetitionNotifications } from "./notifications.js";
import { transitionCompetitionState } from "./state.js";

const AUTOMATIC_STATES = new Set(["UPCOMING", "SUBMISSIONS_OPEN", "REVIEW", "VOTING"]);
const SYSTEM_SUBJECT = "system:competition-jobs";

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function parseConfig(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function due(value, nowMs) {
  if (typeof value !== "string" || !value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= nowMs;
}

export function automaticCompetitionTarget(competition, now = new Date()) {
  if (!competition || !AUTOMATIC_STATES.has(competition.lifecycleState)) return null;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("Scheduled competition time is invalid");

  const config = competition.config ?? {};
  const schedule = config.schedule ?? {};
  const votingEnabled = Boolean(config.voting?.enabled);
  const judgingEnabled = Boolean(config.judging?.enabled);

  let target = null;
  if (competition.lifecycleState === "UPCOMING" && due(schedule.submissionsOpenAt, nowMs)) {
    target = "SUBMISSIONS_OPEN";
  } else if (competition.lifecycleState === "SUBMISSIONS_OPEN" && due(schedule.submissionsCloseAt, nowMs)) {
    target = "REVIEW";
  } else if (competition.lifecycleState === "REVIEW") {
    if (votingEnabled && due(schedule.votingOpenAt, nowMs)) {
      target = "VOTING";
    } else if (!votingEnabled && judgingEnabled && due(schedule.judgingOpenAt, nowMs)) {
      target = "JUDGING";
    }
  } else if (
    competition.lifecycleState === "VOTING"
    && judgingEnabled
    && due(schedule.votingCloseAt, nowMs)
    && due(schedule.judgingOpenAt, nowMs)
  ) {
    target = "JUDGING";
  }

  // RESULTS_READY is deliberately not a scheduled target. That state means staff
  // has closed the scoring stage and is ready to build/review a provisional
  // result set. Clock expiry alone is insufficient evidence that scoring is
  // complete, ties are resolved, abuse flags are handled, or judges have scored.
  if (!target || !canTransitionCompetition(competition.lifecycleState, target, { automatic: true })) return null;
  return target;
}

export async function listAutomaticCompetitionCandidates(db, limit = 100) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("Competition database binding is unavailable");
  const safeLimit = Number.isInteger(limit) ? Math.min(250, Math.max(1, limit)) : 100;
  const result = await db.prepare(`
    SELECT
      c.id,
      c.lifecycle_state AS lifecycleState,
      c.current_config_version AS configVersion,
      v.config_json AS configJson
    FROM competitions c
    JOIN competition_config_versions v
      ON v.competition_id = c.id
     AND v.version = c.current_config_version
    WHERE c.lifecycle_state IN ('UPCOMING','SUBMISSIONS_OPEN','REVIEW','VOTING')
    ORDER BY c.updated_at ASC, c.id ASC
    LIMIT ?
  `).bind(safeLimit).all();
  return rows(result).map((row) => ({
    id: row.id,
    lifecycleState: row.lifecycleState,
    configVersion: Number(row.configVersion),
    config: parseConfig(row.configJson)
  })).filter((row) => row.config);
}

export async function advanceAutomaticCompetitionStates(db, now = new Date(), { limit = 100 } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new TypeError("Scheduled competition time is invalid");
  const createdAt = nowDate.toISOString();
  const candidates = await listAutomaticCompetitionCandidates(db, limit);
  const outcomes = [];

  for (const competition of candidates) {
    const targetState = automaticCompetitionTarget(competition, nowDate);
    if (!targetState) continue;
    const result = await transitionCompetitionState(db, {
      competitionId: competition.id,
      expectedState: competition.lifecycleState,
      targetState,
      operationId: crypto.randomUUID(),
      auditEventId: crypto.randomUUID(),
      actorSubject: SYSTEM_SUBJECT,
      actorUuid: null,
      note: `Automatic schedule transition to ${targetState}`,
      createdAt
    });
    outcomes.push({
      competitionId: competition.id,
      from: competition.lifecycleState,
      to: targetState,
      status: result.status
    });
  }
  return outcomes;
}

export async function runCompetitionScheduledJobs(env, now = new Date()) {
  if (!env?.COMPETITIONS_DB) throw new TypeError("Competition database binding is unavailable");
  const nowDate = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(nowDate.getTime())) throw new TypeError("Scheduled competition time is invalid");
  const nowIso = nowDate.toISOString();

  const identityPruned = await pruneCompetitionIdentityState(env.COMPETITIONS_DB, nowDate);
  const recoveredNotifications = await recoverStaleCompetitionNotifications(
    env.COMPETITIONS_DB,
    nowIso,
    300
  );
  const lifecycle = await advanceAutomaticCompetitionStates(env.COMPETITIONS_DB, nowDate, { limit: 100 });

  let notifications = [];
  try {
    notifications = await drainCompetitionNotifications(env, env.COMPETITIONS_DB, { limit: 100 });
  } catch (error) {
    // Lifecycle scheduling must not be disabled merely because the Minecraft bridge
    // is temporarily unavailable. The outbox remains durable for the next run.
    notifications = [{ status: "DRAIN_FAILED", error: String(error?.message ?? error).slice(0, 300) }];
  }

  return { identityPruned, recoveredNotifications, lifecycle, notifications };
}

export { SYSTEM_SUBJECT };
