# Competition Platform private development bring-up

This runbook brings up the Competition Platform without changing `enthusia.info` or deploying the Competition feature to production.

## Safety boundary

Use completely separate development resources:

- Pages project: `enthusia-competitions-dev`
- D1 database: `enthusia-competitions-dev`
- private R2 bucket: `enthusia-competitions-media-dev`
- scheduled Worker: `enthusia-competition-jobs-dev`
- bridge hostname: a dedicated Cloudflare Tunnel hostname

The development Pages deployment must be protected by Cloudflare Access before the first Competition build is deployed. The bridge hostname must use an Access **Service Auth** policy plus the bridge's independent bearer/HMAC/replay protection.

Do not bind any development resource to the production `enthusia-site` Pages project.

## 1. Verify the branch and build

Use `dev/competitions`. PR #6 is a CI/review surface only and must remain Draft until private acceptance testing and the normal-player beta are complete.

```bash
npm install --ignore-scripts
npm test
npm run build
```

The generated Pages directory is `dist/client`.

## 2. Create isolated Cloudflare resources

With current Wrangler v4 and the intended Cloudflare account selected:

```bash
npx wrangler login
npx wrangler whoami
npx wrangler d1 create enthusia-competitions-dev
npx wrangler r2 bucket create enthusia-competitions-media-dev
npx wrangler pages project create enthusia-competitions-dev --production-branch main --compatibility-date 2026-08-22
```

`main` is intentionally the new dev project's nominal production branch. Build from `dev/competitions`, then deploy that exact green commit to the dedicated development project's Access-protected primary environment. This uses Cloudflare's Production environment only inside `enthusia-competitions-dev`; it does not deploy to the production `enthusia-site` project or change `enthusia.info`.

Record the D1 database ID printed by Wrangler.

## 3. Enable Access for the development site before deploying

In Cloudflare Dashboard:

1. Go to **Workers & Pages** → `enthusia-competitions-dev` → **Settings** → **General**.
2. Protect the primary `enthusia-competitions-dev.pages.dev` hostname with a deny-by-default Access application.
3. Open/manage the generated Access application.
4. Keep it deny-by-default and add an Allow policy containing only founders/admins during initial development.
5. Record the Access team domain and the application audience (`aud`) value.

Do not deploy the development build until this policy exists.

## 4. Create the bridge Access Service Auth policy

Create a Cloudflare Tunnel route from a dedicated HTTPS hostname to the Minecraft server's loopback bridge listener, for example:

`https://competitions-bridge-dev.enthusia.info` → `http://127.0.0.1:8765`

Then create a separate Cloudflare Access self-hosted application for that bridge hostname.

Create an Access service token named something like `enthusia-competitions-dev-bridge`. Configure the bridge Access application with a **Service Auth** policy that allows only that service token. Save both values immediately:

- service-token Client ID
- service-token Client Secret

Cloudflare only shows the Client Secret at creation/rotation time.

The website and jobs Worker send the standard `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers. The bridge still independently verifies its own bearer token, HMAC signature, body hash, timestamp, and replay nonce after Access admits the request.

## 5. Prepare Wrangler development configs

Copy:

- `cloudflare/competition-preview/wrangler.example.jsonc` → `cloudflare/competition-preview/wrangler.dev.jsonc`
- `cloudflare/competition-jobs/wrangler.example.jsonc` → `cloudflare/competition-jobs/wrangler.dev.jsonc`

Both `.dev` files are local/ignored files. Replace the development D1 ID and placeholders. Do not commit secrets.

For the Pages development environment, set non-secret variables:

- `APP_ENV=preview`
- `COMPETITIONS_ENABLED=true`
- `COMPETITIONS_PUBLIC_ACCESS=true`
- `COMPETITIONS_MANAGER_ROLES=founder,admin`
- `COMPETITIONS_MODERATOR_ROLES=founder,admin,moderator,developer`
- `COMPETITIONS_PREVIEW_ROLES=founder,admin`
- `COMPETITIONS_SITE_ORIGIN=https://<Access-protected-preview-host>`
- `COMPETITION_BRIDGE_ORIGIN=https://<bridge-host>`
- `COMPETITION_BRIDGE_ACCESS_REQUIRED=true`
- `COMPETITION_BRIDGE_ACCESS_CLIENT_ID=<bridge-service-token-client-id>`
- `DISCORD_CLIENT_ID=<Discord application ID>`
- `DISCORD_GUILD_ID=<Enthusia Discord server ID>`
- `DISCORD_OAUTH_REDIRECT_URI=https://<Access-protected-preview-host>/api/competitions/auth/discord/callback`
- `COMPETITIONS_DISCORD_STAFF_ROLE_ID=<Discord staff role ID>`
- `CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<preview Access application audience>`

Set secret values only in Cloudflare encrypted/secret storage:

- `OPENAI_API_KEY`
- `DISCORD_CLIENT_SECRET`
- `COMPETITION_BRIDGE_BEARER_TOKEN`
- `COMPETITION_BRIDGE_HMAC_SECRET`
- `COMPETITION_BRIDGE_ACCESS_CLIENT_SECRET`
- `COMPETITIONS_DISCORD_STAFF_WEBHOOK`
- `COMPETITIONS_DISCORD_BOT_TOKEN` (optional, required only for contributor DMs)

The bearer token and HMAC secret must be different random values of at least 32 characters.

The jobs Worker needs the same bridge origin, bridge Access Client ID/Secret, bearer/HMAC credentials, development D1 binding, Discord staff webhook, and optional Discord bot token.

## 6. Apply the D1 schema

Apply every numbered migration to the **development** D1 database. Do not cherry-pick schema files manually.

```bash
npx wrangler d1 migrations list enthusia-competitions-dev --remote --config cloudflare/competition-preview/wrangler.dev.jsonc
npx wrangler d1 migrations apply enthusia-competitions-dev --remote --config cloudflare/competition-preview/wrangler.dev.jsonc
```

The application currently requires Competition schema version 27 and verifies required tables/triggers before reporting readiness.

## 7. Configure Discord OAuth and notifications

In the Discord developer application:

- add exactly the preview callback configured in `DISCORD_OAUTH_REDIRECT_URI`;
- Competition sign-in requests only `identify`;
- keep the client secret server-side;
- configure the staff webhook for review alerts;
- configure the optional bot token only if contributor invitation DMs are wanted during the preview.

Minecraft linking uses a five-minute one-time code and `/competitionlink <code>` in game. A Minecraft UUID that participates is permanently identity-locked for Competition anti-alt purposes, even after unlinking.

## 8. Install the Minecraft Competition Bridge

Use the JAR artifact produced by the exact green `dev/competitions` CI head.

Install the JAR in the server's `plugins/` directory and start once to generate configuration.

Keep these settings:

- `server.bind-host: 127.0.0.1`
- `server.allow-non-loopback-bind: false`
- bridge port `8765` unless intentionally changed
- `integrations.lumaguilds-submit-permission: SUBMIT_COMPETITION_ENTRIES`

Set the same bridge bearer/HMAC values used by Pages/Jobs through the preferred environment variables, then set `server.enabled: true` and restart/reload the bridge.

Verify `/competitionbridge status` before continuing.

Do not directly port-forward the bridge. `cloudflared` should be the only path from Cloudflare to `127.0.0.1:8765`.

## 9. Deploy the Access-protected development site

Deploy the exact green `dev/competitions` commit to the primary environment of the dedicated development project. Omit `--branch` so the deployment uses that environment's bindings and encrypted secrets:

```bash
npx wrangler pages deploy dist/client \
  --project-name enthusia-competitions-dev \
  --commit-hash <EXACT_GREEN_DEV_SHA> \
  --config cloudflare/competition-preview/wrangler.dev.jsonc
```

Use `https://enthusia-competitions-dev.pages.dev` as the stable development origin and OAuth callback host. Deployment-specific aliases are diagnostic links, not OAuth origins. Configure the origin, callback, D1/R2 bindings and secrets in this dedicated environment before testing authenticated flows.

Confirm an unauthenticated browser cannot view the preview.

## 10. Deploy the scheduled jobs Worker

Deploy `cloudflare/competition-jobs` with its ignored dev Wrangler config after all secrets are present.

It may advance only safe clock-driven lifecycle transitions and retry notification outboxes. It deliberately cannot make results ready, publish final results, distribute rewards, or archive a competition.

## 11. Development acceptance checks

Before inviting normal-player testers, verify all of the following:

1. Unauthenticated requests to the stable development hostname are blocked by Cloudflare Access.
2. Production `https://enthusia.info/` still has no Competition navigation item or Competition D1/R2 binding.
3. `/api/competitions/admin/status` returns `ok: true` for an authorized founder/admin.
4. The bridge hostname rejects ordinary browser/curl traffic without the Access service token, and valid service-token requests still require the bridge HMAC/bearer checks.
5. Discord sign-in succeeds; Minecraft linking expires after five minutes; used identities cannot transfer between Discord accounts.
6. Submit solo, group, and guild entries; confirm private coordinates never appear in public API responses.
7. Verify image cleanup, free OpenAI moderation failure-closed behavior, drag/drop, reorder, cover, full-size view, and eight-image maximum.
8. Verify contributor invite/reminder flows, optional Discord DMs, and roster locking.
9. Verify staff receives review alerts in game and Discord and can perform Needs Changes, approve, reject, disqualify, flag, image removal, entry remove/restore, staff edit, manual entry, and Gallery promotion/removal.
10. Verify one Discord identity receives one ballot across linked Minecraft accounts and cannot bypass self-vote, judge, entry-cap, or judge-reward exclusions with an alt.
11. Verify voting eligibility uses PlayTimePlugin active minutes.
12. Verify judge coordinate access is absent unless explicitly enabled; judges cannot submit/vote; criteria, bonus/penalty, public feedback, and private notes save correctly.
13. Verify provisional standings are staff-reviewed before explicit result publication and flagged approved entries block publication.
14. Verify reward preview, confirmation, ledger, retry/reconciliation, and duplicate-operation protection.
15. Regression-check Home, Rules, Market, Leaderboards, Gallery, Staff, Vote, Appeals, and reviewer pages on the development build.

## LumaGuilds dependency

The Competition Bridge expects the LumaGuilds permission `SUBMIT_COMPETITION_ENTRIES`. The prepared change lives on `wsg138/LumaGuilds:dev/competition-submission-permission`. It must be merged into the active LumaGuilds build before guild-entry authorization can pass its acceptance test.

## Production launch remains separate

Production requires separate production D1/R2/jobs bindings, production OAuth/Access/bridge configuration, a completed player beta/security review, and explicit founder approval. Development navigation on `enthusia-competitions-dev` does not authorize or imply a production-site navigation change.
