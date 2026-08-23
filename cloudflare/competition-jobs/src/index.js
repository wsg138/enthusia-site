import { runCompetitionScheduledJobs } from "../../../functions/lib/competitions/scheduled-jobs.js";

function enabled(env) {
  return String(env?.COMPETITION_JOBS_ENABLED ?? "false").trim().toLowerCase() === "true";
}

export default {
  async scheduled(controller, env, ctx) {
    if (!enabled(env)) return;
    const scheduledFor = Number.isFinite(controller?.scheduledTime)
      ? new Date(controller.scheduledTime)
      : new Date();
    ctx.waitUntil(
      runCompetitionScheduledJobs(env, scheduledFor).catch((error) => {
        console.error("Competition scheduled jobs failed", {
          message: String(error?.message ?? error).slice(0, 500)
        });
      })
    );
  }
};

export { enabled };
