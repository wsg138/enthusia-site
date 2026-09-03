import {
  drainAppealDiscordNotifications,
  recoverStaleAppealDiscordNotifications
} from "../../../functions/lib/appeal-notifications.js";
import {
  drainCompetitionDiscordNotifications,
  recoverStaleCompetitionDiscordNotifications
} from "../../../functions/lib/competitions/discord-notifications.js";
import { runCompetitionScheduledJobs } from "../../../functions/lib/competitions/scheduled-jobs.js";

function enabled(env) {
  return String(env?.COMPETITION_JOBS_ENABLED ?? "false").trim().toLowerCase() === "true";
}

async function runDiscordJobs(env, scheduledFor) {
  if (!env?.COMPETITIONS_DB) return;
  const nowIso = scheduledFor.toISOString();
  const results = await Promise.allSettled([
    recoverStaleCompetitionDiscordNotifications(env.COMPETITIONS_DB, nowIso, 300),
    recoverStaleAppealDiscordNotifications(env.COMPETITIONS_DB, nowIso, 300),
    drainCompetitionDiscordNotifications(env, env.COMPETITIONS_DB, { limit: 100 }),
    drainAppealDiscordNotifications(env, env.COMPETITIONS_DB, { limit: 100 })
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("One or more Discord notification jobs failed");
  }
}

export default {
  async scheduled(controller, env, ctx) {
    if (!enabled(env)) return;
    const scheduledFor = Number.isFinite(controller?.scheduledTime)
      ? new Date(controller.scheduledTime)
      : new Date();
    ctx.waitUntil(Promise.allSettled([
      runCompetitionScheduledJobs(env, scheduledFor),
      runDiscordJobs(env, scheduledFor)
    ]).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Competition scheduled jobs failed", {
            message: String(result.reason?.message ?? result.reason).slice(0, 500)
          });
        }
      }
    }));
  }
};

export { enabled, runDiscordJobs };
