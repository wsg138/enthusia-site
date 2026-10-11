# Combined feature integration — SPEAR record

## Spec
One reviewable branch based on current canonical main must retain the competition/account/appeal platform, moderation/events, market layers, red/gold visual design, and native wiki fixes. Public navigation must expose all public pages. Private/admin controls retain authentication and authorization. Backend feature flags, migrations, signed Staff/Competition Bridge requests, and rollback/publication guards must remain intact.

## Prove
Canonical main inspected at 79160e35fb110640a1a29dc92b8cff068d78d221 on 2026-10-11. Existing six feature repair heads are verified; original worktrees are preserved. The redesign branch omits competitions/account/punishments/events/moderation navigation and pages that live in other branches. This integration resolves that split. Existing repository tests establish contracts; no historical red/green proof is fabricated. No EARS/state helper tooling exists; this is the manual requirement/task/evidence record.

## Acceptance
- [x] All six repaired feature branches incorporated with overlapping contracts resolved.
- [x] Home and navigation reach competitions, events, market, leaderboards, gallery, account, appeals and moderation.
- [x] Existing meaningful tests and build pass; added integration regressions cover missing feature discovery and script/page contracts.
- [x] Responsive combined preview uses actual assets and labels simulated APIs; verified phone and desktop interactions.
- [ ] Source pushed in a PR; hosted checks/review findings inspected at its exact head.

## Boundaries
Local integration and reviewable PR authorized. No production merge/deployment, Cloudflare resource provisioning, database migration application, live wiki publication, or messages to other chats. Static preview requires fixtures to demonstrate authenticated/backend states; production acceptance remains separate.

## Integrated source checkpoints

| PRs | Branch | Exact included head |
| --- | --- | --- |
| #5/#48 | contributor/feedback/pr5 | eb34bf7e173a92f5fe5bef1b457c0de22457a6e3 |
| #6/#49 | contributor/feedback/pr6 | 499f956c2d0856e2b4edd225cce8be21bac2fa83 |
| #42/#50 | contributor/feedback/pr42 | 2404f87676c7c1360c29eebe35626af1c3b64bee |
| #45/#51 | contributor/feedback/pr45 | b5e6b7cc8e0d91e2d5fab826617e96b2cde98af8 |
| #46 | contributor/feature/market-map-layers | ec925221fa979f6547667e8d74d2d4609d6599ff |
| #47 | contributor/redesign/red-gold | 32b9deb5bfed51ebbebf7d5cd653dc07380671cf |

## Conflict decisions

- Retained the account-linked, structured appeal workflow, attachment/conversation support, staff dashboards, permissions and persistence behavior from the competition platform. Earlier review fixes and branch histories are incorporated; their original records are preserved under docs/pr-feedback/.
- Retained the richer Gallery submission/review interface while applying shared red/gold navigation and styling. Home shortcuts expose every public feature. The maintained main staff roster remains the source for page cards.
- Restored signed Staff lifecycle routes and added signed public GET support without removing explicit preview/production target selection. New moderation aliases use the existing public DTO sanitizers and fail closed on malformed upstream data.
- Restored the Market owner URL helper before the merged viewer. Shared scripts load once. Native wiki close controls and manual-only sidebar publication remain intact.

## Verification

- npm test: lint, page/asset checks, 465 unique tests, and map layer checks passed (15 buildings, 71 stalls, 94 shops). Added regressions cover Staff target/signatures, moderation privacy projection, complete discovery, duplicate scripts and prevention of preview API writes.
- npm run build passed, including regenerated combined preview pages. Production pages do not load preview fixtures; the preview uses actual templates/controllers with explicitly labeled sample responses and visitor/player/staff personas. All write methods are blocked in the preview.
- Phone (390px) and desktop (1440px): 18 route/state combinations scanned at each width. Navigation, entry wizard, voting, results, Gallery dialog, map layers, persona switching and admin editor interactions passed with no uncaught errors or horizontal overflow. Interaction tests observed no backend API network requests.
- Maven verify passed with 14 Java tests, using local JDK 23 and release 21 compilation. The bridge sources are unchanged by conflict resolution; hosted CI is configured for Java 21. The generated 1.0.0-SNAPSHOT JAR is an unmerged local verification artifact and was not uploaded or activated.

## Remaining acceptance

The original competition feature has a main-based Codacy complexity/configuration backlog documented in CODACY-BASELINE.md and the branch feedback snapshots. Integration does not claim to clear that inherited backlog. Fresh main-based analysis and hosted Actions status are recorded in the PR handoff. Cloudflare preview resource bindings, D1 migrations, Staff/Competition Bridge runtime validation, OAuth/Turnstile and real client/player acceptance remain the development bring-up gates; feature flags/defaults are unchanged.
