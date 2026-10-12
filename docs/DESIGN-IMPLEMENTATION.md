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

## Market theme and missing-icon correction

Spec: the interactive map, building/stall drawers and inspector must use the site's Minecraft font, red/gold/cream surfaces and square borders. Player and unowned-stall placeholders must load from production and nested, commit-pinned preview pages. Native item tooltip/container art and map interaction semantics remain intact.

Prove: the supplied screenshots show brown rounded panels, a serif drawer, clipped building titles and missing placeholders. Inspection traced document-relative asset URLs to nonexistent `preview/assets/market/` paths; relocated overlays also lacked an explicit font. A browser pass additionally reproduced a 404 for the potion manifest.

Engine/architecture: one scoped market theme styles both the page and existing overlay portal without changing other pages or backend contracts. Drawers reserve the title column correctly when Back is hidden. Runtime icon, raster, font and potion-manifest URLs resolve beside their loaded scripts, so nested previews and production share the same assets.

Refine/evidence: browser checks at 390px touch and 1440px cover all seven map layers, opening Stalls 49–54, player/unowned SVG natural widths, stall selection and item inspection. Both overlay fonts are Minecraft; no horizontal overflow, 404 assets or uncaught errors occurred. The nested hosted potion-color regression checks both the requested URL and applied exact tint. The full local test/build results and public preview verification are recorded with this delivery. SPEAR remains manual because no local EARS/state tooling is available. No production activation or merge is part of this correction.

### Requested player placeholder skin

The user selected [NameMC skin c1f032d78f7651c3](https://namemc.com/skin/c1f032d78f7651c3) for generic player placeholders. The bundled SVGs now reproduce the exact 8x8 face pixels at (8,8) and outer-layer face at (40,8) from its 64x64 texture (`https://s.namemc.com/i/c1f032d78f7651c3.png`). They require no runtime NameMC request. Working player head URLs still replace the generic head; guild and unowned-stall visuals retain their respective semantics. This is a reversible asset substitution, so behavioral engine changes and additional unit tests do not apply. Verify P2wn/Stall 35 in desktop and touch previews, including loaded base/overlay assets and unchanged drawer controls.

### Price tracker item icons

Spec/proof: the supplied screenshot shows two-letter abbreviations in price rows and weekly mover slots. Replace those abbreviations with actual bundled Minecraft textures, retaining the red slot frames, item names, price calculations and selection behavior. The same item slot renderer serves price rows, risers/fallers and most-traded items. It resolves API material keys or preview item names through the existing material manifest, with asset URLs relative to the loaded script for nested previews. Unknown materials use the existing barrier texture rather than an invented item. This presentation change does not alter market data contracts; verify loaded textures, row/filter/chart interactions and responsive layout at desktop and phone widths.

### Site-wide icon audit, guild visuals and competition rules

Spec/proof: check the remaining website for item abbreviation placeholders; extend the visual rule to guilds and correct the supplied competition Rules screenshot. Source searches and a browser inventory of 40 generated page routes found no remaining item abbreviation boxes outside the previously corrected market insights. Other short labels represent guild identity, rank, numbered instructions, counters and file types. The archived design reference remains a faithful record of the supplied original rather than a modified implementation.

Engine/architecture: market guild standings use embedded banner data or join public guild profiles by name. Missing designs use the shared renderer's neutral gray banner with an accessible unavailable label. Public leaderboard and legacy guild visuals also use banners instead of initials/member heads. No banner pattern is invented for a guild missing its export. The competition detail stylesheet replaces rounded tabs, translucent gradient rules cards and low-contrast gold headings with square red/gold/cream panels and readable text.

Refine/evidence: 484 local tests, lint and site/map validation pass. Desktop 1440px and touch 390px checks cover guild-mode selection, five rendered neutral banners, a simulated provided banner replacing its placeholder, previous-week navigation, Rules/Overview/Rewards tabs, square cream rules cards and no overflow or uncaught errors. Actual guild designs require their public banner exports; preview guild standings without them intentionally show neutral banners. Static build and public phone verification are recorded with delivery. No local EARS/state helper exists; this remains the manual SPEAR record. No merge or production activation is included.

### Resource pack link and supplied category background

The user requested removal of the resource-pack card's placeholder download link, and selected one supplied council-hall screenshot for Rules, Appeals and Punishments. The card retains its existing description that the pack is offered on join. The supplied PNG is copied byte-for-byte as a local asset; the three hero backgrounds keep their existing readability overlay and responsive cover layout. These are reversible markup/asset substitutions, so new behavioral engine tests do not apply. Regenerate the interactive preview, validate page references/build, and inspect all three heroes at 390px and 1440px, plus the guide card without its removed link.

### Remaining website theme audit

Spec: find and correct residual native-workflow styling that conflicts with the exported red/gold/cream, square-border and Minecraft-font design. Preserve responsive geometry, data, permissions, draft handling and all control semantics. Native Minecraft tooltip art, semantic status colors and the map's circular connection indicator are intentional specialized visuals.

Prove: a computed-style browser inventory across 40 preview routes with the Staff persona found dark rounded gallery tabs, gallery dialogs, appeal tabs, admin status blocks, moderation cards/fields and stray system-font controls. A separate competition-state inventory reproduced blue/brown rounded cards in My Submission, Vote, Entries, Judges, Results, empty/error states and How to enter.

Engine/architecture: one final shared stylesheet supplies scoped corrections to the existing native components. It loads after the page-specific styles on actual public pages and their generated interactive previews. The archived source design reference is untouched. The rules cover cream panels, red/gold borders, readable headings/body text, square form fields and file buttons, selected states and error/danger treatments; they do not change controllers or APIs.

Refine/evidence: all 484 local tests, lint, 118-page reference validation and market-layer verification pass. The existing nine mobile interaction scenarios pass, including honest preview failure for polls/editor/alerts. Forty-eight additional checks at 1440px and 390px touch cover three competition lifecycles and their available tabs, gallery filter/dialog input/close, Appeals, Moderation, publishing and competition administration. They report no uncaught errors or horizontal overflow. The final route inventory and static/cinematic build are recorded with this delivery. Public phone verification checks the delivered head separately. This is a manual SPEAR record because no local EARS/state helpers exist; no merge, deployment or live client acceptance is implied.

### Website feature and button verification

Spec: audit reachable controls across the website and verify native client requests and recovery behavior separately from sample-data previews. Fix failures through PR #52 without production writes or deployment. A mock response proves client behavior, not live OAuth, payment, Discord delivery, D1 provisioning or a Minecraft producer installation.

Prove: a 40-route action/link inventory found a dead Creator brand-kit link. A browser sweep reproduced a publishing exception (`Cannot set properties of null (setting 'disabled')`): `event.currentTarget` becomes null after asynchronous dispatch, leaving Import historical design drafts disabled. A new countdown test failed for an event later in the same hour because the event tuple lost minutes/seconds. Further client-path inspection found silent sign-out failures, overlapping poll writes and gallery failure/retry problems, including the old sign-in return path and stale category responses.

Engine/architecture: capture the publishing button before awaiting, supply a real local brand kit and preserve its static Creator resources even with no feed records, retain exact event UTC minutes/seconds and refresh the countdown, expose sign-out retry feedback, lock all poll choices during a pending vote, validate positive alert thresholds before sending, and make gallery request failures recoverable. Gallery no longer treats failed loads as empty collections or malformed responses as successful uploads; it prevents duplicate submits, exposes review errors, restores controls, returns sign-in to the submission page and ignores stale category responses. Backend permissions and persistence contracts are unchanged.

Refine/evidence:
- Final browser sweep: 287 reachable button clicks across 40 routes, no uncaught exceptions. No-op candidates were distinguished from selected filters, boundary/reset actions, preview-denied writes and controls covered by an open modal; this is not an assertion that every possible state was exhaustively exercised.
- Production API-shaped checks: 28 record/unavailable render scenarios; News draft/publish/revision-conflict recovery; poll pending lock, saved selection and failed-vote recovery; alert validation/create/remove; account unlink/start/poll/link completion/sign-out success and sign-out error feedback. These requests were intercepted locally and did not affect live records.
- Gallery at 390px/1440px: transport failure, malformed JSON, successful submit, duplicate-submit prevention, review failure/retry, rapid filter switching and the sign-in return URL. Creator download and event month/today controls also pass.
- Historical import regression: reproduced disabled-button exception before the fix, then restored-button/no-error behavior afterward. Two committed countdown tests cover within-hour timing and periodic advancement past an expired event.
- Existing nine mobile interactions still pass, including honest preview failure for save/vote/alert actions. Full local tests, lint, HTML references, map validation, build and latest public phone results are recorded with delivery.

Live acceptance still requires configured COMMUNITY_DB/OAuth/Turnstile resources, real account verification, canonical server feed exporters, alert-worker activation and Tebex payment testing. No live vote, publication, upload, moderation decision, account change, Discord message, payment, merge or deployment was made during this audit. SPEAR remains the manual requirement/proof/implementation/evidence record; no local EARS/state tooling exists.
