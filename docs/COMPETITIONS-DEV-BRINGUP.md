# Competition Platform private development bring-up

This runbook brings up the Competition Platform without changing `enthusia.info` or the production `main` branch.

## Safety boundary

Use a completely separate Cloudflare Pages project named `enthusia-competitions-dev` (or equivalent), a separate D1 database named `enthusia-competitions-dev`, a separate private R2 bucket named `enthusia-competitions-media-dev`, and a separate scheduled Worker named `enthusia-competition-jobs-dev`.

Protect the entire development Pages hostname with Cloudflare Access before enabling the competition feature flag. During founder/admin development, only founder/admin identities should pass Access. During the player beta, add only the selected testers to that Access policy. `COMPETITIONS_PUBLIC_ACCESS=true` is safe on this development project because the entire hostname is still Access-protected; it means the Competition public-read APIs use the new Discord competition identity instead of requiring the legacy Minecraft claims on every player request. Staff/admin APIs still authorize through Cloudflare Access server-side.

Do not bind any of these development resources to the existing production Pages project.

## 1. Verify the branch and build

Use `dev/competitions`. The draft PR to `main` is a CI/review surface only and must remain unmerged until launch approval.

```bash
npm install --ignore-scripts
npm test
npm run build
```

The generated Pages directory is `dist/client`.

## 2. Create isolated Cloudflare resources

With Wrangler v4 and the intended Cloudflare account selected:

```bash
npx wrangler whoami
npx wrangler d1 create enthusia-competitions-dev
npx wrangler r2 bucket create enthusia-competitions-media-dev
npx wrangler pages project create enthusia-competitions-dev --production-branch dev/competitions --compatibility-date 2026-08-22
```

Copy `cloudflare/competition-preview/wrangler.example.jsonc` to an ignored local file, replace the development D1 database ID and host/application placeholders, and keep that local file out of Git.

Cloudflare D1 records applied migration files in its migrations table. Apply the numbered repository migrations to the **development** database by database name or the explicit dev config; never target a production binding by accident:

```bash
npx wrangler d1 migrations list enthusia-competitions-dev --remote --config cloudflare/competition-preview/wrangler.dev.jsonc
npx wrangler d1 migrations apply enthusia-competitions-dev --remote --config cloudflare/competition-preview/wrangler.dev.jsonc
```

The migration set is intentionally ordered and includes identity, anti-alt, notification, Gallery, and audit constraints. Do not manually cherry-pick individual schema files into D1.

## 3. Configure the private Pages project

Bind only the dev resources:

- `COMPETITIONS_DB` → `enthusia-competitions-dev`
- `COMPETITIONS_MEDIA` → `enthusia-competitions-media-dev`

Set non-secret variables:

- `APP_ENV=preview`
- `COMPETITIONS_ENABLED=true`
- `COMPETITIONS_PUBLIC_ACCESS=true`
- `COMPETITIONS_MANAGER_ROLES=founder,admin`
- `COMPETITIONS_MODERATOR_ROLES=founder,admin,moderator,developer`
- `COMPETITIONS_PREVIEW_ROLES=founder,admin`
- `COMPETITIONS_SITE_ORIGIN=https://<private-preview-host>`
- `COMPETITION_BRIDGE_ORIGIN=https://<private-bridge-host>`
- `DISCORD_CLIENT_ID=<Discord application ID>`
- `DISCORD_OAUTH_REDIRECT_URI=https://<private-preview-host>/api/competitions/auth/discord/callback`
- `COMPETITIONS_DISCORD_STAFF_ROLE_ID=<Discord staff role ID>`
- `CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<Access application audience>`

Set secret values only in Cloudflare secret/encrypted-variable storage:

- `OPENAI_API_KEY`
- `DISCORD_CLIENT_SECRET`
- `COMPETITION_BRIDGE_BEARER_TOKEN` (32+ random characters)
- `COMPETITION_BRIDGE_HMAC_SECRET` (32+ independent random characters)
- `COMPETITIONS_DISCORD_STAFF_WEBHOOK`
- `COMPETITIONS_DISCORD_BOT_TOKEN` (optional but required for contributor invite DMs)

The Discord webhook must be an HTTPS `discord.com`/`discordapp.com` webhook URL. The application validates the host/path and never returns the URL through the admin status endpoint. The optional bot token is used only to open a DM channel and send contributor invitation messages to already-linked Discord identities; it is never returned to the browser or written to D1. If the bot token is omitted, contributor in-game/login reminders continue to work and pending Discord invite rows remain undelivered rather than being discarded.

## 4. Configure Discord OAuth

In the Discord application, add exactly the private preview callback URL configured in `DISCORD_OAUTH_REDIRECT_URI`.

Competition sign-in requests only the Discord `identify` scope. Minecraft accounts are linked separately through a five-minute one-time code and `/competitionlink <code>` in game. Once a Minecraft UUID participates in a competition, D1 permanently locks it to that Discord identity for future competition-account linking; unlinking cannot be used to move historical participation to another Discord account.

For contributor DMs, use a bot application that is allowed to create direct-message channels with linked users. The DM content contains only the competition title, entry title, contributor role, and private-preview action link—never coordinates, moderation notes, staff-only data, or secrets.

## 5. Install and expose the Minecraft bridge

The verified bridge JAR is uploaded by the `Site validation` GitHub Actions run as an artifact named `EnthusiaCompetitionBridge-<commit SHA>`. Install that JAR on the Enthusia Minecraft server.

Configure its `plugins/EnthusiaCompetitionBridge/config.yml` with the same bearer/HMAC secrets used by Pages/Worker. Keep the HTTP server bound to a private/local interface. Expose it to Cloudflare through an authenticated/private Cloudflare Tunnel hostname; do not port-forward the bridge directly to the public Internet.

The bridge provides:

- PlayTimePlugin active-time lookup;
- Minecraft player lookup;
- LumaGuilds membership/permission lookup;
- five-minute account-link code claim;
- persistent contributor login reminders;
- staff in-game review alerts;
- idempotent reward-delivery integration.

Use `/competitionbridge reload` after non-secret config edits when appropriate. Secret changes should be followed by coordinated Pages/Worker and bridge configuration updates so signatures do not temporarily diverge.

## 6. Deploy the separate Pages project

After `npm run build` and after Access is already configured on the development hostname:

```bash
npx wrangler pages deploy dist/client \
  --project-name enthusia-competitions-dev \
  --branch dev/competitions \
  --commit-hash <EXACT_DEV_BRANCH_SHA> \
  --config cloudflare/competition-preview/wrangler.dev.jsonc
```

Do not deploy this branch to the production `enthusia-site` Pages project.

## 7. Deploy the scheduler

Copy `cloudflare/competition-jobs/wrangler.example.jsonc` to an ignored dev config and set the same development D1 ID. Put the bridge bearer/HMAC secrets, Discord staff webhook, and (if enabled) contributor Discord bot token into that Worker as secrets/variables too. The scheduler has no public fetch handler and `workers.dev` is disabled.

It advances only safe date-driven stages (`UPCOMING` → submissions, submissions → review, review → voting/judging, voting → judging). It deliberately cannot mark scoring `RESULTS_READY`, publish results, distribute rewards, or archive. It also retries the independent Minecraft and Discord notification outboxes.

## 8. Development acceptance checks

Before inviting normal-player testers:

1. An unauthenticated request to the development hostname is blocked by Cloudflare Access.
2. Production `https://enthusia.info/` has no Competition navigation item and no Competition D1/R2 binding.
3. `/api/competitions/admin/status` reports `ok: true` for an authorized founder/admin.
4. Discord sign-in succeeds, Minecraft linking expires after five minutes, and a used Minecraft identity cannot transfer to another Discord account.
5. Submit one solo, one group, and one guild entry; verify coordinates never appear in public API payloads.
6. Verify image metadata cleanup, OpenAI moderation failure-closed behavior, drag/drop upload, reordering, cover selection, full-size public viewing, and max-eight-image enforcement.
7. Verify contributor invites/reminders and acceptance; if `COMPETITIONS_DISCORD_BOT_TOKEN` is configured, verify the linked contributor receives the DM, linking after the invite still queues it, and accepting/declining before delivery suppresses a stale DM. Once voting begins, roster changes are locked except already-pending invitation responses.
8. Verify staff gets the review alert both in-game and via Discord, and the Discord link opens the exact private review item.
9. Verify Needs Changes, Approve, Reject, Disqualify, image removal, whole-entry removal/restore, staff edits, manual player entry creation, private investigation flags, and Gallery promotion/removal.
10. Verify one Discord identity gets one ballot across all linked Minecraft accounts; linked alts cannot self-vote, bypass judge rules, exceed the personal entry cap, or receive judge-excluded rewards.
11. Verify active-playtime voting eligibility is sourced from PlayTimePlugin.
12. Verify judge coordinate access is absent unless explicitly enabled, assigned judges cannot submit or public-vote, and criteria/bonus/public-feedback/private-note scoring saves correctly.
13. Verify provisional standings/results are staff-reviewed before explicit result publication, and a flagged approved entry prevents final result publication until resolved.
14. Verify reward preview, confirmation, delivery ledger, retry, and duplicate-operation protection.
15. Verify Home, Rules, Market, Leaderboards, Gallery, Staff, Vote, Appeals, and reviewer pages still work on the development build.

## Production launch remains separate

Production requires a separate production D1/R2, separate production scheduler binding, production OAuth redirect, production bridge/site origin, final beta/security review, and an explicit founder approval to merge/deploy. Adding the Community → Competitions navigation item is part of that launch change, not this private development bring-up.
