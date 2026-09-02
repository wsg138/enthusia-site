# enthusia-site

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/b32c17176ee24992b3ae8569e84ab3a1)](https://app.codacy.com/gh/wsg138/enthusia-site/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

This repository is the public Enthusia SMP website at `enthusia.info`. It contains the static player-facing site, Cloudflare Pages Functions/API routes, leaderboard/data presentation, public-safe punishment history, code-backed punishment appeals, and internal reviewer tooling.

## What belongs here

The website is a **presentation and web-workflow layer**, not the source of truth for Minecraft gameplay mechanics or moderation state.

- Gameplay/plugin facts should originate in the canonical plugin repositories and current `enthusia-server-state` deployment snapshot.
- Punishment and appeal eligibility/state is supplied by EnthusiaStaff's restricted website API; the website does not maintain a second punishment database.
- Public leaderboard data is read through controlled endpoints/exports from the authoritative server systems.
- Secrets, staff-only evidence, private reports, internal case notes and protected identity data must never be copied into static website content.

This boundary is important for future wiki automation: website copy can be a useful presentation reference, but plugin documentation/current deployment wins if website text has become stale.

## Public site

`public/` contains the static Pages site. Current public-facing areas include:

- Home / server overview
- Rules
- Plugins / server features
- Market
- Leaderboards
- Gallery/media
- Staff
- Voting
- About/supporting informational pages
- Public-safe punishment history and search
- Discord-authenticated punishment appeals

The sitemap intentionally exposes the main public discovery pages. Test/reviewer/internal routes should not be treated as public server-feature documentation merely because their assets live in the same repository.

## Punishment appeals

Appeals are now implemented as a **website workflow**, replacing the old direction of handling appeals primarily through Discord tickets.

`public/punishments.html` provides public-safe punishment history and search. It proxies only the Staff API's explicitly public fields and never exposes evidence, reports, staff notes, network identity, linked-account data or private appeal state.

`public/appeal.html` provides the private player workflow. Discord sign-in secures the website account, and a linked Minecraft account determines which punishments the player can appeal. The same page shows submitted appeals, their current status, staff messages, player replies, original answers and attached files.

Flow:

1. The player signs in with Discord. Current Discord membership is not required, so a Discord-banned player can still appeal.
2. The player links a Minecraft account through the normal server or the separate linking server.
3. The site loads the active punishments available for that linked account.
4. The player selects a punishment, answers the appeal questions and may attach screenshots or text logs.
5. `POST /api/appeals` rechecks the linked identity and punishment, records the complete submission and sends the bounded appeal summary to EnthusiaStaff through the signed server-to-server API.
6. The appeal history page shows status changes and player-visible messages. Authorized staff use the private reviewer workspace to reply, request information, accept or deny.
7. When Discord DMs are configured, a durable notification tells the player to sign in after a staff reply or decision. The DM never includes the appeal, evidence, punishment or outcome.

Security properties include:

- same-origin enforcement on submissions,
- Discord account-derived website identity,
- server-verified Discord-to-Minecraft links,
- owner-scoped appeal history, messages and attachments,
- server-side request signing to the Staff API,
- idempotency protection,
- private/no-store API responses,
- no browser access to Staff API credentials.

Appeal availability ultimately depends on **EnthusiaStaff being deployed/cut over with its website API available**. The website code existing in this repository does not by itself prove that appeals are live in production. Until Staff cutover is confirmed, describe the website appeal system as implemented/prepared rather than claiming the current LiteBans authority is already served through it.

## Competition identity

Public competition pages remain viewable without an account when public access is enabled. Entering or voting uses Discord OAuth and requires both:

- current membership in the configured Enthusia Discord, rechecked at least every 24 hours; and
- a Minecraft account linked to that Discord website session.

Discord membership and linked Minecraft identity are separate checks. Appeals require a linked Minecraft account but do not require the Discord account to remain in the server.

## Leaderboards

The site contains a leaderboard hub and Pages Function routes for server-produced leaderboard data. The design keeps authoritative calculation on the Minecraft/server side and gives the browser public-safe output rather than direct database or infrastructure credentials.

Current Enthusia systems known to export/provide leaderboard data include playtime, balance/currency, donor support and server statistics such as kills. Individual plugin repositories document how each board is calculated; the website should not redefine those formulas.

## Market

The public Market page is a web view of Enthusia's market/shop data. Market data should come from the current authoritative market implementation/export. Development/import tools such as `EnthusiaMarketMapper` are not themselves the live player market authority.

## Voting

The vote page presents the current server voting destinations and supporting information. Exact vote rewards, streak semantics and Vote Party behavior are authoritative in `EnthusiaVotes` and the current server deployment configuration.

Do not hard-code old vote-site/reward assumptions into future wiki generation solely from site copy.

## Plugins / feature presentation

The Plugins page is intended to explain notable Enthusia features to players. It is a consumer of documentation, not a substitute for repository-level feature references.

When updating it:

1. check the central documentation inventory,
2. include only live/currently appropriate systems,
3. treat disabled/pre-release/archived systems accordingly,
4. use each plugin's player/deployment guide for detailed mechanics,
5. verify deployment-specific numbers against the latest server snapshot.

## Cloudflare Pages Functions

`functions/` contains server-side Pages Functions. Major route groups currently include:

- `/api/punishments`
- `/api/appeals`, `/api/appeals/claim` and `/api/appeals/eligible`
- `/api/leaderboards/...`
- `/api/reviewer/...`
- `/api/health`

Shared function libraries implement authentication, input validation, response handling, request signing and other security boundaries.

Reviewer APIs are internal tooling and should not be surfaced as player features.

## Internal reviewer / cinematic tooling

The repository also contains reviewer pages, cinematic review documentation, terrain-mask/image tooling and related test/development assets. These exist to build/review the website and media presentation; they are **not server gameplay systems** and should normally be excluded from the public wiki feature inventory.

## Build and validation

The project is intentionally lightweight/static and uses Node scripts rather than a large client framework.

```bash
npm ci --ignore-scripts
npm run build
npm run lint
npm run check
npm test
```

ESLint 8 is pinned as a development dependency so local checks and the hosted Codacy analyzer use the same configuration. It is installed only inside this project's `node_modules` directory; it does not add a global tool or background service. Delete `node_modules` to remove the local installation, and run `npm ci --ignore-scripts` to restore it from `package-lock.json`.

Current test coverage includes site validation plus dedicated competition, Discord-membership, appeal-auth, punishment-site, navigation and potion-preview tests.

Additional cinematic/mask tools are available through the package scripts for site media work.
They use Python and the Pillow version declared in `requirements.txt`. Keep that
dependency isolated from the system Python installation:

```bash
python -m venv .venv-tools
# Activate .venv-tools for your shell, then:
python -m pip install --requirement requirements.txt
```

Delete `.venv-tools` to remove the local Python environment.

## Deployment

The site is structured for Cloudflare Pages/Pages Functions and includes Wrangler configuration. Infrastructure bindings, API credentials and secrets belong in the deployment environment and must not be written into public documentation.

Discord sign-in requires `DISCORD_CLIENT_ID`, encrypted `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID` and an exact `DISCORD_OAUTH_REDIRECT_URI`. Staff website access also requires the Discord staff-role ID mappings documented in the development bring-up guide. Competition entry additionally requires the isolated D1/R2 bindings and Minecraft bridge configuration described there.

`ENTHUSIA_SITE_DISCORD_BOT_TOKEN` optionally enables contributor-invite and appeal-update DMs. It belongs to the limited website-notification application, not the privileged staff moderation bot. The older `COMPETITIONS_DISCORD_BOT_TOKEN` name remains accepted during migration. Keep either value in the deployment secret store, never in the repository or Wrangler variables.

Appeal submission requires encrypted `STAFF_API_BEARER_TOKEN` and `STAFF_API_HMAC_SECRET` values that match the EnthusiaStaff website API. Public punishment history and every appeal operation also require `staff-api.enthusia.info` to resolve to the deployed Staff API. The UI reports that dependency as unavailable rather than accepting an unverified appeal when the integration is offline.

## Documentation rules for future AI/wiki work

Treat this repository as the canonical source for **how Enthusia's website presents and routes web features**, but not automatically for the underlying game rules.

For a factual wiki update:

- Gameplay mechanic -> canonical plugin docs + live server snapshot.
- Current availability -> central documentation inventory + live snapshot.
- Appeals/punishments -> EnthusiaStaff status + this site's web-flow docs.
- Market -> current authoritative Market runtime/export, not migration/mapping tools.
- Leaderboard calculation -> the plugin that owns that statistic.
- Static wording/design -> this repository.

Never publish environment secrets, service credentials, signed-request keys, internal reviewer endpoints, private moderation evidence or protected account/identity information.
