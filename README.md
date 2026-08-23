# enthusia-site

[![Codacy Badge](https://app.codacy.com/project/badge/Grade/b32c17176ee24992b3ae8569e84ab3a1)](https://app.codacy.com/gh/wsg138/enthusia-site/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

This repository is the public Enthusia SMP website at `enthusia.info`. It contains the static player-facing site, Cloudflare Pages Functions/API routes, leaderboard/data presentation, authenticated punishment appeals, and internal reviewer tooling.

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
- Authenticated punishment appeals

The sitemap intentionally exposes the main public discovery pages. Test/reviewer/internal routes should not be treated as public server-feature documentation merely because their assets live in the same repository.

## Punishment appeals

Appeals are now implemented as a **website workflow**, replacing the old direction of handling appeals primarily through Discord tickets.

`public/appeal.html` provides the player UI. The player does not type an arbitrary Minecraft identity: the site uses the Minecraft account associated with the authenticated website session.

Flow:

1. `GET /api/appeals/eligible` authenticates the website user and asks EnthusiaStaff for punishments that this account may appeal.
2. The page shows those eligible punishments to the signed-in player.
3. The player chooses a punishment and submits a reason between **10 and 1000 characters**.
4. `POST /api/appeals` validates the punishment UUID/reason, derives the account UUID/name from the authenticated session, generates an idempotency key and sends a signed server-to-server request to EnthusiaStaff.
5. The browser receives only the public-safe result returned through the website API layer.

Security properties include:

- same-origin enforcement on submissions,
- authenticated account-derived player identity,
- server-side request signing to the Staff API,
- idempotency protection,
- private/no-store API responses,
- no browser access to Staff API credentials.

Appeal availability ultimately depends on **EnthusiaStaff being deployed/cut over with its website API available**. The website code existing in this repository does not by itself prove that appeals are live in production. Until Staff cutover is confirmed, describe the website appeal system as implemented/prepared rather than claiming the current LiteBans authority is already served through it.

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

- `/api/appeals` and `/api/appeals/eligible`
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
npm run build
npm run check
npm test
```

Current test coverage includes site validation plus dedicated appeal-auth and potion-preview tests.

Additional cinematic/mask tools are available through the package scripts for site media work.

## Deployment

The site is structured for Cloudflare Pages/Pages Functions and includes Wrangler configuration. Infrastructure bindings, API credentials and secrets belong in the deployment environment and must not be written into public documentation.

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