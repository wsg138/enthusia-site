# Production site configuration

Production deploys canonical `main` to `https://enthusia.info` through the
`enthusia-site` Cloudflare Pages project. The root `wrangler.toml` owns its
non-secret variables and resource bindings. Preview deployments do not inherit
the production databases or private media bucket.

## Applied resources

- `COMPETITIONS_DB`: `enthusia-competitions`, separate from development.
- `COMMUNITY_DB`: `enthusia-community`, separate from development.
- `COMPETITIONS_MEDIA`: private `enthusia-competitions-media` R2 bucket.
- `EVENTS_DATA`: `events-leaderboard` R2 bucket, awaiting its server export.
- Existing balance, playtime and donor leaderboard buckets remain bound.

Competition/identity/appeal migrations 0001–0034 and community migration 0001
were applied through migration tracking to the new production databases.
Trigger CASE expressions are parenthesized for Cloudflare D1's SQL parser;
Git attributes retain LF line endings. These changes preserve SQLite behavior.
An already tracked migration must not be rerun against an existing database.

Public punishment and moderation reads use the installed production endpoint
`https://staff-network-api.enthusia.info`. The upstream requires bearer/HMAC
authentication even for its public projections. Pages signs the exact path and
query; the browser receives only the existing allowlisted public DTO fields.
The corresponding production credential pair is stored as encrypted
`STAFF_API_BEARER_TOKEN` and `STAFF_API_HMAC_SECRET` settings.

## Remaining service configuration

1. Configure encrypted `DISCORD_CLIENT_SECRET` for the application matching
   `DISCORD_CLIENT_ID`. Register exactly
   `https://enthusia.info/api/competitions/auth/discord/callback` in that
   application's OAuth redirects. Verify a complete login and logout.
2. Map the current Discord founder/admin/developer/moderator/helper role IDs
   through the `DISCORD_*_ROLE_IDS` settings. Unconfigured roles grant no staff
   access. Verify both allowed and denied accounts.
3. Provision a production Turnstile widget for `enthusia.info`; configure
   `TURNSTILE_SITE_KEY` and encrypted `TURNSTILE_SECRET_KEY` before accepting
   punishment-code claims and appeal writes.
4. Install and verify the Competition Bridge on the intended live server with
   its loopback listener and protected HTTPS route. Configure its distinct
   bearer/HMAC and Access service credentials. Verify Minecraft linking and
   public player/guild context before enabling jobs or rewards.
5. Configure encrypted `OPENAI_API_KEY` for submission moderation. Failed or
   unavailable moderation must continue to block publication.
6. Configure the dedicated website notification bot using encrypted
   `ENTHUSIA_SITE_DISCORD_BOT_TOKEN`. Verify opt-in delivery and opt-out with a
   specifically authorized recipient before activating scheduled delivery.
   The moderation bot must not substitute for this bot.
7. Reconcile the installed guild API's bearer token with `GUILDS_API_BEARER`.
   The existing production guild proxy currently receives upstream HTTP 401.
   Preserve the existing URL until the installed producer is verified.
8. Connect authoritative community snapshots, completed raw-gold sales and
   event exports. `COMMUNITY_INGEST_SECRET` is stored encrypted on Pages; retain
   its matching producer credential outside Git. Empty collections must not
   be replaced with preview fixtures or inferred transactions.

The production databases start empty. No development identities, sample
competitions, preview ballots or historical draft content were copied into
them. Jobs, reward delivery and market alert schedules remain unactivated.

## Validation and rollback

The launch connection changes pass 490 site tests, lint, page/asset checks,
market layer checks, the static build and Pages Functions compilation. The
bridge passes 14 Java tests. Live acceptance must additionally verify page
rendering, the deployed commit, authenticated workflows, actual server exports
and protected staff actions; a successful build does not establish those.

Retain a local Cloudflare project configuration backup before further changes.
The preceding production deployment is
`5f2306ee-a20e-4655-9953-439ae0b3b28d` at source
`79160e35fb110640a1a29dc92b8cff068d78d221`. Cloudflare deployment rollback can
restore the prior application while preserving the new databases. Do not delete
databases or share writable development resources as a rollback shortcut.

Wiki publication is separate. Read-only hosted wiki parser validation currently
receives HTTP 403 from Miraheze. No wiki publisher was dispatched during this
site launch. Codacy's retained analyzer findings are described in
`CODACY-BASELINE.md`; they are not a clean-analysis result.
