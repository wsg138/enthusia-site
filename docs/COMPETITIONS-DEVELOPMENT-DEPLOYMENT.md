# Competitions development deployment

This document defines the safety boundary for developing the Enthusia Competition Platform.

## Branch and production boundary

- Production source remains `main`.
- Competition development happens on `dev/competitions` until an explicit launch decision.
- Do not merge or deploy competition work to the production site as part of ordinary development.
- Existing production pages, APIs, appeal behavior, market behavior, and leaderboard behavior must remain functional throughout development.

## Preview visibility

The development deployment must be a Cloudflare preview deployment or separate development project protected by Cloudflare Access.

Initial access policy:

- Founder accounts: allowed.
- Admin accounts: allowed.
- Everyone else: denied.

Before the normal-player beta, explicitly expand the Access policy to the selected testers. Do not rely on an obscure URL as the access control.

Competition routes must not be added to the production navigation until launch. Preview competition pages should also send/receive `noindex` protections while development is private.

## Environment isolation

Development competition data must never share writable state with production competition data.

Use distinct preview resources for:

- competition D1 database;
- private competition-media R2 bucket;
- OpenAI API secret/configuration;
- Discord notification credentials;
- Minecraft bridge authentication secrets;
- future integration credentials.

The existing production leaderboard R2 bindings remain read-only dependencies of unrelated site functionality and are not competition storage.

Local secrets belong in `.dev.vars` or `.env` files and are gitignored. Cloudflare-hosted secrets must be configured in the exact environment used by the protected development deployment. Never commit API keys or bearer tokens.

## Required competition feature gates

Before any competition endpoint becomes reachable, it must require an explicit environment flag such as `COMPETITIONS_ENABLED=true`. The default/missing value is disabled.

Private development endpoints must additionally fail closed when the expected preview authentication/authorization context is absent.

The UI hiding a link is never considered authorization. Every privileged API route must independently authorize the requester server-side.

## OpenAI moderation

Only the OpenAI Moderation API is part of the automatic content-screening design.

- Titles/descriptions and other submitted text are screened.
- Uploaded images are screened before public publication.
- No paid general-purpose vision-model second pass is used.
- Competition-specific checks such as Minecraft relevance, visible coordinates, waypoints, minimaps, private chat, or other base-discovery risks remain staff review responsibilities.
- An OpenAI API failure must not silently approve content. The submission should remain pending/retryable or be routed to staff review.

## Development bindings

Cloudflare Pages supports separate Production and Preview bindings. The dedicated `enthusia-competitions-dev` project may use its primary environment for the stable Access-protected test site; that Cloudflare environment is still isolated from the production `enthusia-site` project. Bind only development D1/R2 resources and development credentials to it. Production-site competition bindings remain intentionally absent until launch preparation.

Recommended binding names:

- `COMPETITIONS_DB` — D1
- `COMPETITIONS_MEDIA` — private R2

Recommended non-secret environment variables:

- `COMPETITIONS_ENABLED=true` only in the isolated development project during development
- `APP_ENV=preview`
- `DISCORD_GUILD_ID=<Enthusia Discord server ID>`

Recommended secret names:

- `OPENAI_API_KEY`
- `COMPETITIONS_BRIDGE_SECRET`
- Discord credentials when that integration is enabled

## Deployment checklist

Before each wider test:

1. Confirm the deployment is from `dev/competitions`, not `main`.
2. Confirm Cloudflare Access blocks an unauthenticated browser.
3. Confirm the development deployment uses development-only D1/R2 resources.
4. Confirm no competition navigation/link is present on production.
5. Run repository validation/tests/build.
6. Test existing Home, Rules, Market, Leaderboards, Gallery, Staff, Vote, Appeals, and reviewer behavior relevant to the changed files.
7. Confirm private coordinates cannot appear in public API payloads or image metadata.
8. Confirm failed moderation/integration calls fail closed or enter a reviewable pending state.

## Launch boundary

Production launch is a separate, explicit operation after founder approval and player beta testing. It includes creating/binding production resources, enabling production competition routes, adding the Community navigation item, and running a final security/regression review. None of those steps are implied by development commits.
