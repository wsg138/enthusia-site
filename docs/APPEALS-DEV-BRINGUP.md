# Punishment and appeal preview bring-up

This runbook brings up the punishment/appeal website against non-production resources. It does **not** authorize a production deployment or change `enthusia.info`.

## Runtime resources

Use the same isolated preview Pages project described in `COMPETITIONS-DEV-BRINGUP.md` with:

- D1 binding `COMPETITIONS_DB`
- private R2 binding `COMPETITIONS_MEDIA`
- an Access-protected preview hostname
- a preview Turnstile widget
- a non-production/test-capable EnthusiaStaff website API credential pair

Apply every migration in `migrations/` through `0032_appeal_punishment_bindings.sql`. Do not apply only the appeal migrations; they depend on the earlier identity/rate-limit schema.

## Non-secret variables

Configure these values in the preview Pages environment:

- `COMPETITIONS_SITE_ORIGIN=https://<preview-host>`
- `STAFF_API_ORIGIN=https://<staff-preview-host>.enthusia.info`
- `DISCORD_CLIENT_ID=<Discord application ID>`
- `DISCORD_GUILD_ID=<Enthusia Discord server ID>`
- `DISCORD_OAUTH_REDIRECT_URI=https://<preview-host>/api/competitions/auth/discord/callback`
- `DISCORD_FOUNDER_ROLE_IDS=<comma-separated role IDs>`
- `DISCORD_ADMIN_ROLE_IDS=<comma-separated role IDs>`
- `DISCORD_DEVELOPER_ROLE_IDS=<comma-separated role IDs>`
- `DISCORD_MODERATOR_ROLE_IDS=<comma-separated role IDs>`
- `DISCORD_HELPER_ROLE_IDS=<comma-separated role IDs>`
- `APPEAL_REVIEWER_ROLES=founder,admin,moderator`
- `TURNSTILE_SITE_KEY=<preview Turnstile site key>`
- `CF_ACCESS_TEAM_DOMAIN=<team>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<preview Access application audience>`

Discord OAuth must allow the callback above and the application must support the scopes currently requested by the site: `identify guilds.members.read`.

`STAFF_API_ORIGIN` is optional in production and defaults to `https://staff-api.enthusia.info`. When set for preview, it must be a bare HTTPS origin on an `enthusia.info` subdomain; credentials, custom ports, paths, query strings and off-domain hosts are rejected before any Staff credential is sent.

## Secrets

Set these only through Cloudflare encrypted secret storage:

- `DISCORD_CLIENT_SECRET`
- `TURNSTILE_SECRET_KEY`
- `STAFF_API_BEARER_TOKEN`
- `STAFF_API_HMAC_SECRET`
- `ENTHUSIA_SITE_DISCORD_BOT_TOKEN` (optional; enables appeal-update DMs)

`COMPETITIONS_DISCORD_BOT_TOKEN` remains an accepted temporary fallback for the optional website notification bot token. Do not use the privileged EnthusiaStaff Discord bot token for website notifications.

The Staff bearer/HMAC values must match the credentials accepted by the Staff API selected by `STAFF_API_ORIGIN`. Preview must use preview/test credentials accepted only by the isolated Staff endpoint; do not reuse production Staff API credentials for preview acceptance.

## Required acceptance checks

From an exact reviewed `dev/competitions` head:

```bash
npm ci --ignore-scripts
npm run lint
npm run check
npm test
npm run build
```

Then deploy only to the Access-protected preview project and verify:

1. Discord sign-in creates a website identity and a linked Minecraft account can be selected.
2. Punishment-code claim requires same-origin, Turnstile and the linked website identity.
3. A successful claim appears under **Bound punishments** on the profile; the raw punishment code is never returned or stored by the website.
4. **Recheck** revalidates using the server-owned website account ID and stored generation. The browser sends only the punishment ID.
5. A rotated Staff code produces the stale/rotated state and requires the newest punishment code to be claimed again.
6. An unowned punishment binding cannot be revalidated or used to read private evidence.
7. Public punishment/search/case responses contain only the explicit public allowlist and never staff notes, reporters, network identity, coordinates or evidence.
8. A submitted punishment cannot receive a second authoritative appeal. EnthusiaStaff enforces one appeal per punishment.
9. Player appeal history, comments and attachments are owner-scoped. Reviewer attachments require an authorized reviewer role.
10. Two reviewers acting on different versions produce a conflict for the stale decision; the stale reviewer refreshes before trying again.
11. Accepting an appeal goes through EnthusiaStaff's reviewer decision/acceptance workflow and normal sanction-removal path; the website never removes a punishment directly.
12. Staff/Turnstile/D1/R2 failures produce bounded unavailable/error states rather than accepting unverifiable actions.

## Current contract gaps

These requirements are not yet safe to implement solely in this repository because current EnthusiaStaff `main` does not expose the required authoritative workflow state/API:

- player edits to an already submitted appeal until a staff member claims it;
- explicit staff claim ownership for appeals;
- Admin/Founder reopen of a decided appeal.

Do not emulate those transitions only in D1. They need to be added to the Staff authority first, with version/conflict/authorization rules, and then consumed by this site.

The product goals also describe an email/password + email-verification account lifecycle. The current stronger website implementation uses Discord OAuth plus a linked Minecraft identity. Adding email/password registration is a separate identity feature and should not replace or weaken the working Discord identity path during punishment/appeal launch preparation.

## Production gate

Production remains blocked until all of the following are true:

- exact-head build/tests/analyzers are green;
- hosted Codacy reports no new valid findings;
- isolated preview acceptance passes with real D1/R2/Turnstile and Staff API connectivity;
- the Staff appeal claim/edit/reopen contract gap is either implemented or explicitly excluded from the launch scope by the owner;
- production bindings/secrets are configured outside the repository;
- explicit production deployment approval is given.
