# PR #46 feedback repair — 2026-10-11

## Spec
Preserve existing permissions, API contracts, conflict handling, persistence semantics and visual design. Reject unsupported dynamic request destinations. Treat provider text as text. Keep live publication separate from PR validation.

## Prove
Checked the current PR comments and original Codacy report. Authoritative main was fetched and inspected at 79160e35fb110640a1a29dc92b8cff068d78d221. Work uses an isolated branch from the existing PR head, preserving the original branch and unrelated checkouts. No project EARS validator or SPEAR state helpers were found; this document provides manual spec/task/evidence tracking. Existing tests are not claimed as historical red/green proof.

The original Added findings are recorded in [pr-feedback-findings.json](pr-feedback-findings.json). These are an original-head snapshot, not a measurement of this delivered head.

## Engine and architecture
- Split layer descriptions by responsibility while preserving their buckets, labels and summaries.
- Removed provider HTML interpolation for price badges. Badge kinds are allowlisted and text is inserted with native DOM textContent.
- Added a regression proving injected provider text stays literal text and unrecognized badge kinds are rejected.

## Refine / verification
npm test: 15 tests passed, including the badge safety test. Market asset/map checks passed (71 stalls, 94 shops). npm run build passed. Rent/Stock controls and layer URL updates passed browser checks at 390px and 1440px.

Browser checks use Edge and fixtures/mocked unavailable APIs. They do not establish real mobile device, live API, Safari, or production acceptance.

## Remaining findings and delivery
The shopCard template uses client-validated numeric IDs/enums and escaped owner text; its retained trusted item/location rendering may still be reported by broad template rules. The provider-controlled HTML path was removed. Hosted analysis is pending.

- [x] Inspect comments and current base.
- [x] Implement supported fixes and focused behavioral regressions.
- [x] Run relevant local tests/build and inspect changed integration contracts.
- [ ] Confirm hosted checks and fresh Codacy analysis at the delivered commit (recorded in the follow-up PR or final handoff).
- [ ] Resolve remaining analyzer configuration/complexity findings where applicable.

No merge, production deployment, live wiki publication, or rule disabling was performed. The connected account can update fork-owned PRs #46/#47 directly; fixes to owner-owned branches are delivered as follow-up PRs targeting those original branches.
