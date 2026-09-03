# Enthusia Competition Jobs Worker

This Worker is the traffic-independent scheduler for the Competition Platform. It is separate from the Pages site so failed notification retries and date-driven lifecycle changes do not depend on a player or staff member loading a competition page.

## Responsibilities

Every scheduled run:

1. recovers notification outbox rows left in `DELIVERING` for more than five minutes;
2. advances safe date-driven lifecycle states;
3. drains pending/failed Minecraft bridge notifications;
4. retries competition and appeal Discord notifications.

The worker may automatically advance:

- `UPCOMING` → `SUBMISSIONS_OPEN` when submissions open;
- `SUBMISSIONS_OPEN` → `REVIEW` when submissions close;
- `REVIEW` → `VOTING` when voting opens;
- `REVIEW` → `JUDGING` when voting is disabled and judging opens;
- `VOTING` → `JUDGING` after voting closes and judging has opened.

The worker deliberately does **not** transition a competition into `RESULTS_READY`. That state means staff has explicitly closed the scoring stage and is ready to construct/review the provisional result set. A clock expiring does not prove all required judging is complete, ties are resolved, abuse flags are handled, or the result set has been reviewed.

It also never publishes drafts, final results, rewards, or archives. `RESULTS_READY` → `COMPLETED` remains an explicit staff action through the dedicated results-publication endpoint.

Voting and judging API endpoints independently enforce their configured close timestamps, so leaving the lifecycle row in `VOTING` or `JUDGING` after its window closes does not allow late ballots or late score changes while staff performs the completion review.

## Development deployment

Copy `wrangler.example.jsonc` to a local ignored/temporary Wrangler configuration and replace the development D1 database ID. Bind this worker to the **same development D1** used by the private Competition preview site.

Required secret/environment configuration:

- `COMPETITION_JOBS_ENABLED=true`
- `COMPETITION_BRIDGE_ORIGIN`
- `COMPETITION_BRIDGE_BEARER_TOKEN`
- `COMPETITION_BRIDGE_HMAC_SECRET`
- `ENTHUSIA_SITE_DISCORD_BOT_TOKEN` when contributor invites and appeal-update DMs are enabled

The bridge origin must be HTTPS. Bearer/HMAC secrets are never committed.
The Discord token is also a secret and must be configured through Wrangler's
secret store. Appeal DMs contain only a generic update notice and a link back to
the private appeal page; appeal text, evidence, punishments and decisions are not
copied into Discord.

The example Cron Trigger runs every two minutes. Cloudflare Cron Triggers invoke the Worker's `scheduled()` handler; this worker has no public fetch handler and the example disables `workers.dev`.

Production gets a separate Worker/binding later. Do not point the development worker at a production Competition D1 database.
