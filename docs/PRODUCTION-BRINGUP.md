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

Discord OAuth is now configured and its login callback was verified with a real
website session. The application is branded Enthusia. Current Discord staff
role IDs are tracked in `wrangler.toml`. A managed production Turnstile widget
is configured for `enthusia.info`, with its secret encrypted in Pages. The
dedicated Enthusia notification bot token is also encrypted in Pages.

Automated moderation remains disabled by owner choice. Upload publication must
continue to fail closed while moderation is unavailable; do not bypass that
check to activate uploads or competition image submissions.

The signed network account endpoints are prepared in EnthusiaStaff Velocity:
`POST /v1/website/accounts` and `POST /v1/website/accounts/link`. They expose
current Minecraft ownership to the authenticated website service and issue the
existing five-minute `/link` challenge. The browser never supplies the Discord
owner used by those upstream requests. Account projections refresh from the
network on authenticated requests, preserve competition identity locks, and
fail closed on unavailable or conflicting data. Unlinking continues in-game
through `/unlink CONFIRM` to preserve network main-account selection and history.

`NETWORK_ACCOUNT_LINKS=false` deliberately keeps this integration inactive until
the owner selects a proxy restart time and the prepared Velocity runtime is
installed and verified. No database migration is required. After the protected
endpoints pass live verification, set the flag to `true`, redeploy Pages, and
test recognition of an existing linked account and a new in-game challenge.
Changing only the website flag before the server deployment would break
authenticated workflows and must not be used as an activation shortcut.

Production notification workers are provisioned separately from development:
`enthusia-competition-jobs-production` and `enthusia-market-alerts-production`.
Their production Wrangler configurations bind the correct D1 databases and
their website bot token is encrypted. Both enable flags are false and both
cron lists are empty. Keep them disabled until bridge connectivity, actual sale
ingestion, opt-in delivery and opt-out behavior pass live acceptance. This setup
does not send messages or activate lifecycle/reward processing.

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
7. Keep `GUILDS_API_BEARER` aligned with the installed LumaGuilds API. The live
   API was verified with its current credential and the encrypted Pages setting
   was updated. A new Pages deployment activates secret changes. The existing
   API URL remains unchanged.
8. Connect authoritative community snapshots, completed raw-gold sales and
   event exports. `COMMUNITY_INGEST_SECRET` is stored encrypted on Pages; retain
   its matching producer credential outside Git. Empty collections must not
   be replaced with preview fixtures or inferred transactions.

The production databases were created separately from development. Published
content is now present: 79 Timeline entries, 26 Creator records, 23 changelog
entries, 23 Hall of Fame records, 14 roadmap entries and two news posts. Timeline
records retain their source-verification status. No development identities,
sample competitions or preview ballots were copied into production. Jobs,
reward delivery and market alert schedules remain unactivated.

The live runtime log confirms Minecraft 26.2 on Paper 26.2. The homepage and
shared FAQ use that version. Before installing the Competition Bridge, verify
its API/runtime compatibility with this server; its existing build targets
Java 21 and Paper 1.21.8.

The `paper-26-2` Maven profile compiles and tests against Paper
`26.2.build.123-stable`, retaining the default profile for existing development
builds. Building that profile requires JDK 25 or newer. CI checks both profiles;
the live-profile artifact is the one prepared for production installation.
Compilation does not establish live provider compatibility or reward delivery.

The donor website snapshot was refreshed from the installed plugin's cached
official Tebex aggregate totals. Only the existing public leaderboard fields
were exported, with the aggregate's actual update timestamp. Raw payments,
transaction identifiers and private payment details remain excluded. The
installed donor test build intentionally disconnects its R2 writer, so this
one-time repair does not establish automatic future updates. Reconnecting the
maintained producer requires a separate validated change.

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
