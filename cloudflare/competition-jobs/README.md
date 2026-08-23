# Enthusia Competition Jobs Worker

This Worker is the traffic-independent scheduler for the Competition Platform. It is separate from the Pages site so failed notification retries and date-driven lifecycle changes do not depend on a player or staff member loading a competition page.

## Responsibilities

Every scheduled run:

1. recovers notification outbox rows left in `DELIVERING` for more than five minutes;
2. advances safe date-driven lifecycle states;
3. drains pending/failed Minecraft bridge notifications.

The worker may automatically advance:

- `UPCOMING` → `SUBMISSIONS_OPEN` when submissions open;
- `SUBMISSIONS_OPEN` → `REVIEW` when submissions close;
- `REVIEW` → `VOTING` when voting opens;
- `REVIEW` → `JUDGING` when voting is disabled and judging opens;
- `REVIEW` → `RESULTS_READY` when neither voting nor judging is enabled;
- `VOTING` → `JUDGING` after voting closes and judging has opened;
- `VOTING` → `RESULTS_READY` when judging is disabled;
- `JUDGING` → `RESULTS_READY` when judging closes.

It deliberately does **not** publish drafts, final results, rewards, or archives. `RESULTS_READY` → `COMPLETED` remains an explicit staff action through the dedicated results-publication endpoint.

## Development deployment

Copy `wrangler.example.jsonc` to a local ignored/temporary Wrangler configuration and replace the development D1 database ID. Bind this worker to the **same development D1** used by the private Competition preview site.

Required secret/environment configuration:

- `COMPETITION_JOBS_ENABLED=true`
- `COMPETITION_BRIDGE_ORIGIN`
- `COMPETITION_BRIDGE_BEARER_TOKEN`
- `COMPETITION_BRIDGE_HMAC_SECRET`

The bridge origin must be HTTPS. Bearer/HMAC secrets are never committed.

The example Cron Trigger runs every two minutes. Cloudflare Cron Triggers invoke the Worker's `scheduled()` handler; this worker has no public fetch handler and the example disables `workers.dev`.

Production gets a separate Worker/binding later. Do not point the development worker at a production Competition D1 database.
