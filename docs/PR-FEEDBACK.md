# PR #42 feedback repair — 2026-10-11

## Spec
Preserve existing permissions, API contracts, conflict handling, persistence semantics and visual design. Reject unsupported dynamic request destinations. Treat provider text as text. Keep live publication separate from PR validation.

## Prove
Checked the current PR comments and original Codacy report. Authoritative main was fetched and inspected at 79160e35fb110640a1a29dc92b8cff068d78d221. Work uses an isolated branch from the existing PR head, preserving the original branch and unrelated checkouts. No project EARS validator or SPEAR state helpers were found; this document provides manual spec/task/evidence tracking. Existing tests are not claimed as historical red/green proof.

The original Added findings are recorded in [pr-feedback-findings.json](pr-feedback-findings.json). These are an original-head snapshot, not a measurement of this delivered head.

## Engine and architecture
- Merged current canonical main into the existing branch.
- Made the mobile wiki publication workflow manual-only, with a fixed concurrency group and exact github.sha checkout. Pushing a PR no longer triggers publication.
- Separated native menu opening, close-header creation, native label normalization and keyboard binding while preserving checkbox ownership.
- Split publisher source validation and narrowed handled exceptions. Fixed the local WebKit harness output directory and filenames.

## Refine / verification
npm test: 14 tests passed. npm run build passed. Changed JavaScript passed node --check; publisher passed Python py_compile. A local Minerva fixture passed click, Enter, Space and backdrop closing, including duplicate script loading and both native-label/non-label backdrops (8 native changes per fixture, no browser errors).

Browser checks use Edge and fixtures/mocked unavailable APIs. They do not establish real mobile device, live API, Safari, or production acceptance.

## Interactive preview
[Native wiki menu fixture](preview/wiki-menu.html) uses the actual repaired script and repository CSS with simulated Minerva markup. Mobile accessibility of an external preview link is checked separately in delivery.

## Remaining findings and delivery
The live wiki publisher and live WebKit probe were not executed. Local Edge testing does not establish Safari performance or production acceptance. The publisher retains backup, revision race checks and readback requirements.

- [x] Inspect comments and current base.
- [x] Implement supported fixes and focused behavioral regressions.
- [x] Run relevant local tests/build and inspect changed integration contracts.
- [ ] Confirm hosted checks and fresh Codacy analysis at the delivered commit (recorded in the follow-up PR or final handoff).
- [ ] Resolve remaining analyzer configuration/complexity findings where applicable.

No merge, production deployment, live wiki publication, or rule disabling was performed. The connected account can update fork-owned PRs #46/#47 directly; fixes to owner-owned branches are delivered as follow-up PRs targeting those original branches.
