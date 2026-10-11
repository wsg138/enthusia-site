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
