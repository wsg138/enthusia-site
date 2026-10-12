# PR 52 live configuration and acceptance

The owner authorized configuration repairs, deployment and live sign-in/Discord delivery testing on 12 October 2026. Payments stop at checkout readiness. Approval of the work does not supply service credentials or repository permissions.

## Configuration target

Use the **Production environment of `enthusia-competitions-dev`** for the stable, Access-protected development hostname `https://enthusia-competitions-dev.pages.dev`. This is an isolated test project, not production `enthusia-site` or `enthusia.info`. Its nominal production branch is `main`; record the actual source commit separately. Deployment-specific aliases are not OAuth origins.

The inspected configuration was split: the development project's Preview environment held the OAuth variables, `COMPETITIONS_DB` and `COMPETITIONS_MEDIA`, while its Production environment held `DISCORD_CLIENT_SECRET` and unrelated leaderboard bindings. Non-secret variables and bindings are managed by Wrangler and appear disabled in the dashboard. Fix them through the dedicated ignored development config, not the production site's root `wrangler.toml`.

The local `cloudflare/competition-preview/wrangler.dev.jsonc` is prepared from inspected non-secret values and existing development resources. It aligns the stable origin/callback, feature flags, Access settings, development database/media and existing leaderboard bindings. Template bridge/webhook values are omitted; their integration remains unavailable until real configuration is supplied. No secret is stored in this file. The intended Staff target is `preview`; credentials and connectivity must be verified independently.

Before application, download the remote config into a separate directory for rollback, inspect existing resource/schema state, and add a separate development `COMMUNITY_DB` with the community migration. Never put community migrations in the competition database. Apply every numbered competition/appeal migration through 0034 using migration tracking after a database backup; do not manually rerun schema files against existing data.

Wrangler authentication is distinct from dashboard sign-in. Its device approval creates CLI permissions; request only required scopes and store credentials through the OS keyring. Inspect the account/project before any mutation. A local prepared file or successful Functions compilation is not remote application or deployment proof.

## Discord owner steps

Open the website Discord application whose ID matches `DISCORD_CLIENT_ID` (inspected ID: `1541144959510642778`). In OAuth2, register exactly:

`https://enthusia-competitions-dev.pages.dev/api/competitions/auth/discord/callback`

The application requests `identify guilds.members.read`. It does not need the user's email or arbitrary DM-reading scopes. Confirm the stored `DISCORD_CLIENT_SECRET` belongs to this application; replace it through encrypted Cloudflare settings only if it is absent/invalid. Use Production on the dedicated development project, matching the target above.

Add the **dedicated website notification bot** token as encrypted `ENTHUSIA_SITE_DISCORD_BOT_TOKEN` in that same environment. Do not substitute an OAuth client secret for a bot token or use the privileged moderation bot. Obtain an existing token from the operator's secure store. If it is unavailable, the Discord application owner must coordinate token rotation and update every dependent deployment. Do not paste either secret in chat or Git.

For market alerts, the separate alert worker needs the same dedicated token and development community database. Leave scheduled delivery disabled until a controlled test and opt-out verification pass. The test recipient is FainNeito, with clearly labeled test content. Inspect pending notification outboxes before enabling delivery to prevent unintended queued messages.

## GitHub maintainer steps

A user with write access to `wsg138/enthusia-site` must open PR 52, review changed workflows and approve the waiting fork workflow runs. The connected contributor account currently has pull-only access. Workflow approval is separate from approving/merging the PR.

Check **Site validation** and **Validate Enthusia wiki preview** for the exact latest head. Review CodeRabbit and Codacy findings against that head. Do not treat the draft-review skip, local tests, or analyzer configuration mismatches as a green hosted result. Fix valid findings and have the repository maintainer assess runtime-inapplicable rules without blanket gate disabling.

Merge only after the reviewed checks/acceptance requirements are met. The production Pages project auto-deploys canonical `main`; verify that its required production bindings/secrets are ready before merging, then record the exact merged/deployed commit and Cloudflare deployment ID. An unmerged fork deployment is an isolated test artifact, never production.

## Acceptance record

- Confirm Access still blocks anonymous requests to the stable development hostname.
- Verify OAuth start redirects to the expected Discord application/callback, complete login, inspect the real website identity, and verify logout. Reaching Discord alone is not successful website sign-in.
- Verify the bridge/linking path separately; its inspected settings still contain placeholders.
- Perform one controlled website-bot test to FainNeito, verify receipt and opt-out, and record failures without copying tokens or signed callback URLs.
- Inspect real community exports and distinguish empty/unavailable data from sample previews.
- Keep Tebex at the existing basket/checkout-readiness boundary; no agreements, payment or rank fulfillment test is included.

SPEAR evidence is manual because no project-local EARS/state helper exists. Configuration proof covers parsing/Functions compilation, remote setting verification and service acceptance; documentation-only steps need no new behavioral engine tests. The latest source checkpoint has 489 passing local tests and a passing static build; deployment and live acceptance require their own evidence.

## Applied development checkpoint — 12 October 2026

Wrangler 4.149.0 was authorized with account/user read and Pages/D1/Workers write. Credentials are encrypted with the key stored in Windows Credential Manager. The remote configuration and competition database were backed up locally before changes. The existing migration history showed only 0032–0034 pending; all three applied successfully. A separate `enthusia-community-dev` database was created and its 0001 community migration applied. Both existing Discord outboxes were empty.

The isolated development deployment uses source `a642d6933c8d97dd18fa51a8f1cd928ce96938e7`; its deployment hostname is `e58846f8.enthusia-competitions-dev.pages.dev`. The profile retains the dedicated development database/media, adds the community binding, preserves existing leaderboard bindings, and places OAuth/Access variables in the same primary development environment as the existing encrypted client secret. Bridge placeholder values were omitted rather than invented. No bot token was added and no delivery was enabled.

Current Wrangler rejects custom configuration paths for Pages deployment and does not allow `account_id` in a Pages config. Deployment therefore used a separate staging directory containing the exact built static assets, Functions source and the development profile named `wrangler.jsonc` at its root. Its output directory is `./site`; the intended account is supplied through `CLOUDFLARE_ACCOUNT_ID`, and the command explicitly names `enthusia-competitions-dev`. Never overwrite or deploy the production site's root configuration to work around this restriction.

Verified after deployment: session and gallery-session APIs return 200 JSON with anonymous sessions; community insights returns 200 JSON; OAuth start returns 302 to Discord application `1541144959510642778` with the stable development callback and `identify guilds.members.read`. Anonymous access to the stable development hostname still redirects to Cloudflare Access. This proves configuration and OAuth entry readiness, not a completed code exchange/session or Discord DM. Production `enthusia.info` remains on canonical main and was not changed.

### Real-server preview feeds

The existing market worker's experimental origin slot was retargeted from the older Sites experiment to the protected development hostname. Its production origin remains `https://enthusia.info`. The same change is recorded in `cloudflare/market-api/wrangler.jsonc` so a later worker deployment retains it. No worker source, synchronization secret or Durable Object binding changed. This replaces market access for the previous experimental hostname.

Both current origins return 200 with their matching CORS header and 71 real stalls. The real snapshot passes the current client record validator. The test site's balance/playtime feeds each return 100 real player records with 12 October export timestamps; donor data contains 10 records dated 29 September. Guild upstream currently returns 401, full community snapshots have not been exported and the sales ledger is empty. Those states remain unavailable/empty and do not fall back to design fixtures. This reversible configuration substitution needs no new behavioral engine test; proof is the before/after CORS response, preserved production response and real-feed contract validation. Browser acceptance of the stable preview requires an allowed user's Cloudflare Access login.
