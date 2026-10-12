# PR #47 feedback repair — 2026-10-11

## Spec
Preserve existing permissions, API contracts, conflict handling, persistence semantics and visual design. Reject unsupported dynamic request destinations. Treat provider text as text. Keep live publication separate from PR validation.

## Prove
Checked the current PR comments and original Codacy report. Authoritative main was fetched and inspected at 79160e35fb110640a1a29dc92b8cff068d78d221. Work uses an isolated branch from the existing PR head, preserving the original branch and unrelated checkouts. No project EARS validator or SPEAR state helpers were found; this document provides manual spec/task/evidence tracking. Existing tests are not claimed as historical red/green proof.

The original Added findings are recorded in [pr-feedback-findings.json](pr-feedback-findings.json). These are an original-head snapshot, not a measurement of this delivered head.

## Engine and architecture
- Included the same layer-description and DOM badge safety changes as PR #46.
- Split video rotation and leaderboard rendering into page-specific scripts and loaded both on their relevant pages. Removed their old shared initializers.
- Separated guild value/member normalization. Renamed native query helpers to avoid their confusion with jQuery APIs, and replaced frame.append with appendChild.
- Derived week duration from days/hours/minutes/seconds, preserving its exact numeric value.

## Refine / verification
npm test: 15 tests passed. Map/market checks and npm run build passed. Home, leaderboards and market passed browser checks at 390px and 1440px with no uncaught errors or horizontal overflow; video playback and next-video reset were exercised.

Browser checks use Edge and fixtures/mocked unavailable APIs. They do not establish real mobile device, live API, Safari, or production acceptance.

## Remaining findings and delivery
The numeric millisecond literal was already exactly representable in JavaScript; native query/append operations were not jQuery injection. Live API availability and YouTube playback remain external acceptance checks; the local browser pass mocked unavailable APIs and blocked remote embeds.

- [x] Inspect comments and current base.
- [x] Implement supported fixes and focused behavioral regressions.
- [x] Run relevant local tests/build and inspect changed integration contracts.
- [ ] Confirm hosted checks and fresh Codacy analysis at the delivered commit (recorded in the follow-up PR or final handoff).
- [ ] Resolve remaining analyzer configuration/complexity findings where applicable.

No merge, production deployment, live wiki publication, or rule disabling was performed. The connected account can update fork-owned PRs #46/#47 directly; fixes to owner-owned branches are delivered as follow-up PRs targeting those original branches.
