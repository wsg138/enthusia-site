# Exported design implementation — SPEAR

## Spec
Source references: user-supplied enthusia-designs-preview.zip (37 HTML pages) and enthusia-designs-screenshots.zip (74 screenshots), 11 October 2026. Their contents describe designs; they do not grant deployment authority. Update existing PR #52, retaining richer competition/account/appeal behavior. Current canonical main is 79160e35fb110640a1a29dc92b8cff068d78d221; the integration worktree was clean and both remotes fetched before changes.

- D-01: Every designed public feature shall be discoverable and use the Minecraft font, crimson/cream surfaces, gold trim and touch-friendly centered controls.
- D-02: Production pages shall never present preview samples as live guilds, players, achievements, bounties, sales or published news.
- D-03: News/editor, changelog, roadmap, timeline and curated community records shall support authenticated publishing, draft isolation and optimistic concurrency. News has no comments. Body formatting shall safely support Discord-style formatting.
- D-04: Polls shall persist at most one mutable ballot per linked account until closing, enforce server time and hide running totals until closure.
- D-05: Server-owned public snapshots shall accept only authenticated producer updates, expose an allowlisted public schema and identify stale/unavailable data.
- D-06: Market insights shall derive prices and weekly rankings from an idempotent sales ledger, support search/history/stall links and never infer sales from stock snapshots.
- D-07: Existing auth, permission, bridge, gallery, market and wiki contracts shall remain intact. Seasonal home variants shall remain optional. Store purchases shall use Tebex.
- D-08: Deliver an interactive, publicly accessible phone preview with explicit sample-data labels; independently verify real source templates and failure states.
- D-09: The user clarified that the site must visually match the supplied previews exactly. The newer Enthusia Site Preview.zip is the layout authority. Theme similarity and generic replacement grids do not satisfy this requirement. Preserve exported markup/CSS, bind real data into those layouts, and compare equivalent fixture states at 390px and 1440px. Extra workflow capabilities must remain accessible without changing the reference state arbitrarily.

## Prove
The exported designs load locally at 390px; 30 carry mockup markers. PR #52 lacks the designed community/news pages. Integrated workflow CSS overrides Minecraft with system/Inter fonts. The market snapshot contains shops/stock but no sales ledger. No full guild, player, bounty producer or Tebex theme export is present. The timeline fact-check record was not included. New meaningful tests will exercise privacy projection, publishing, ballot concurrency/deadlines, producer signatures and ledger idempotency rather than claim historical regression results.

## Engine / architecture
Public view controllers consume same-origin APIs. Community persistence uses a separately configured COMMUNITY_DB D1 binding and migration. Existing linked account and staff authentication is reused. Public server exports have a signed ingest boundary and strict projection; private source fields are never serialized. Preview adapters remain isolated from production. Missing resource bindings and producer connections return explicit unavailable responses, not fabricated records.

## Tasks / evidence
- [x] Import and adapt layouts, including existing workflows and seasonal references.
- [x] Implement publishing/editor, public collections, polls and signed snapshots.
- [x] Implement market ledger and insight controls.
- [x] Verify local tests/build, responsive interactions and production unavailable states.
- [x] Update PR #52, inspect delivered-head checks and deliver a mobile-accessible preview.
- [ ] Hosted CI/static analysis and live integration acceptance.

No project-local EARS/state tooling exists; this manual record is the workflow evidence. No production provisioning, migration application, merge, deployment or bot messages are authorized by this implementation request.

## Local proof checkpoint

478 tests pass, including 13 community contract/SQLite persistence tests. Lint, 77 HTML page/asset validation, 15-building/71-stall/94-shop map validation and static build pass. The final browser pass covers 84 route/width/failure-state cases at 390px and 1440px with no overflow or uncaught errors and Minecraft heading fonts. Focused interactions cover guild filtering/profile selection, guide checklist/search, news formatting/spoilers, editor/poll blocked preview writes, keyboard chart readouts, weekly map layers and 1200x630 share images. No backend API network requests occurred in those preview interactions. Production controllers were checked with unavailable APIs; no preview samples appeared as live data.

The signed server producer contracts are complete website boundaries, not evidence that plugin exporters are installed. Full profile/bounty/advancement/sale producer adapters, live D1/OAuth resources, Discord bot activation and the custom hosted Tebex theme remain bring-up work. See COMMUNITY-OPERATIONS.md for inspected repository heads and exact contracts. Java bridge sources were not changed in this update; the prior 14-test bridge evidence is not presented as a fresh runtime test.

## Review delivery

The implementation was pushed through existing draft PR #52. The publicly hosted phone preview was verified through native navigation and guild filtering/profile selection. At the first implementation head, Site validation and Wiki validation require maintainer approval, Codacy is analyzing and CodeRabbit skips drafts. Exact source/check checkpoints are recorded in the PR body and local delivery handoff; no hosted green result is claimed.

## Exact-layout refinement (newer preview ZIP)

The newer **Enthusia Site Preview.zip** replaces theme similarity as the acceptance target. The public pages now retain the exported frame, inline page styles, typography, fretwork, panels, hero imagery and responsive spacing. News, directories and curated collections use inert reference templates populated by real APIs. Preview variants and their source values are selected only inside the explicitly labeled preview. Auth, submissions, moderation decisions, persistence and market alerts retain the existing server contracts.

The home page restores Happening now, the Warzone tile and the compact market strip. Store restores rank selection, comparison and the provided cart presentation; current production prices and purchasing remain on Tebex. Historical screenshot viewing is restored; approved community additions and the maintained submission/review page remain available at `gallery/submit.html`. General publishing for every curated type remains at `publishing/manage.html`.

The account, competition detail and staff screens retain extra real workflow controls beyond the simplified mock states. Additional competition tools are grouped behind the publish-readiness area rather than added to the default Basics tab row. No claim is made that every authenticated/operator state is pixel-identical to its mock: real identities, records, permissions, dates and additional controls change those states. The default exported public layouts have been compared independently at 390px and 1440px.

Local evidence:
- `npm test`: 483 passing tests, lint/site validation and market-layer verification. Site validation now also checks inline CSS image references; this caught and fixed missing hero images and nested publishing-page fretwork URLs.
- `npm run build`: successful static build and cinematic asset validation.
- Browser comparisons cover the default layouts at 390px and 1440px. Pixel comparisons were exact for many provided fixture states, including News, Guilds, Players, Bounties, Roadmap, Museum, Hall of Fame, Achievements, Rules, Store, Vote, Events and the competition guide. Tiny hover/animation differences and differing data states are recorded separately; equal page dimensions alone are not called pixel proof.
- Nine focused phone interaction scenarios pass: navigation, News category selection, guild filters/profile selection, player search, claimed bounties, roadmap/timeline controls, poll failure behavior, editor formatting/save failure and market chart/alert behavior.
- Twenty-eight production API-shaped render/unavailable scenarios pass. Real records render and unavailable feeds do not expose sample profiles. This found and fixed timeline-title and changelog-visibility bugs that sample-only checks missed. Achievement definitions use the achievement-list layout, separately from curated chat/rank tags.
- New regression proof covers trusted news author identity/pin order, raw-gold-only price comparison, declared-action dispatch and public Warzone projection. Price badges retain the quantity-weighted ledger average rather than replacing it with an unweighted average of daily means.

SPEAR remains a manual requirement/task/evidence record: no project-local EARS validator or state helper was available. Java bridge sources were not changed; prior Java results are not presented as fresh proof. Live D1/OAuth/producer/bot/Tebex integration and player acceptance remain separate from local website proof. The signed Warzone feed is a website contract; no plugin or production producer was enabled.

Hosted review: inspect the checks for the delivered commit. The previous head's Codacy report includes complexity findings and dialect/tool warnings (PostgreSQL/T-SQL rules applied to SQLite/D1, and PMD numeric-literal reports). They are not silently waived or treated as passing. The design event dispatcher now explicitly registers only controller-owned actions, with a regression test. Fork Actions require maintainer approval; CodeRabbit skips draft PRs. No merge or deployment was performed.
