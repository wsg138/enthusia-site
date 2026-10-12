# PR #6 feedback repair — 2026-10-11

## Spec
Preserve existing permissions, API contracts, conflict handling, persistence semantics and visual design. Reject unsupported dynamic request destinations. Treat provider text as text. Keep live publication separate from PR validation.

## Prove
Checked the current PR comments and original Codacy report. Authoritative main was fetched and inspected at 79160e35fb110640a1a29dc92b8cff068d78d221. Work uses an isolated branch from the existing PR head, preserving the original branch and unrelated checkouts. No project EARS validator or SPEAR state helpers were found; this document provides manual spec/task/evidence tracking. Existing tests are not claimed as historical red/green proof.

The original Added findings are recorded in [pr-feedback-findings.json](pr-feedback-findings.json). These are an original-head snapshot, not a measurement of this delivered head.

## Engine and architecture
- Fixed the appeal edit route import paths; a regression imports all three lifecycle route modules.
- Replaced nested email matching with bounded linear validation, preserving the accepted grammar.
- Restricted punishment-binding requests to two exact local routes and lifecycle requests to canonical UUIDs and claim/reopen actions. Added behavior tests that verify rejected values never reach fetch.
- Separated appeal projection/binding/public punishment validation and competition notification/scoring/ordering/reward eligibility responsibilities without changing permissions, data allowlists, deterministic reward ordering, or version/readiness checks.
- Further separated vote/judge components, tie grouping/resolution and result snapshot evidence. The new standings and weighted-recipient helpers pass local CCN <= 8 and NLOC <= 50 checks; pre-existing reward-definition/recipient-selection complexity remains in the recorded backlog.
- Added a 36-character UUID bound and a rule-specific annotation for a verified finite-quantifier regex false positive; request destination behavior tests still run.
- Replaced fixed replay-key test literals with generated UUIDs. Updated the vulnerable brace-expansion dependency; npm audit reports no vulnerabilities.

## Refine / verification
npm test: lint, repository checks and 428 tests passed (3 baseline, 334 competitions/gallery, 85 appeals, 3 potions, 3 wiki). npm run build passed. npm audit passed with zero vulnerabilities.

Browser checks use Edge and fixtures/mocked unavailable APIs. They do not establish real mobile device, live API, Safari, or production acceptance.

## Remaining findings and delivery
The original report contains 207 Added findings, including a substantial existing complexity backlog. This repair does not claim a green Codacy gate or completion of that backlog. SQL findings use ANSI/T-SQL rules for SQLite/D1, generated package-lock size is not application complexity, and some JavaScript regexes are misparsed by Lizard. See findings snapshot and the existing CODACY-BASELINE.md for the required coding-standard correction. Meaningful remaining complexity needs further domain-specific refactoring, not blanket rule suppression.

- [x] Inspect comments and current base.
- [x] Implement supported fixes and focused behavioral regressions.
- [x] Run relevant local tests/build and inspect changed integration contracts.
- [ ] Confirm hosted checks and fresh Codacy analysis at the delivered commit (recorded in the follow-up PR or final handoff).
- [ ] Resolve remaining analyzer configuration/complexity findings where applicable.

No merge, production deployment, live wiki publication, or global rule disabling was performed. The connected account can update fork-owned PRs #46/#47 directly; fixes to owner-owned branches are delivered as follow-up PRs targeting those original branches.
