# PR #45 feedback repair — 2026-10-11

## Spec
Preserve existing permissions, API contracts, conflict handling, persistence semantics and visual design. Reject unsupported dynamic request destinations. Treat provider text as text. Keep live publication separate from PR validation.

## Prove
Checked the current PR comments and original Codacy report. Authoritative main was fetched and inspected at 79160e35fb110640a1a29dc92b8cff068d78d221. Work uses an isolated branch from the existing PR head, preserving the original branch and unrelated checkouts. No project EARS validator or SPEAR state helpers were found; this document provides manual spec/task/evidence tracking. Existing tests are not claimed as historical red/green proof.

The original Added findings are recorded in [pr-feedback-findings.json](pr-feedback-findings.json). These are an original-head snapshot, not a measurement of this delivered head.

## Engine and architecture
- Validate canonical appeal UUIDs before constructing browser request paths. Requests remain same-origin and invalid identifiers cannot reach fetch.
- Formatted the minified appeal clients and replaced fixed replay-key test literals with generated UUIDs.
- Separated JSON parsing/validation from lifecycle handlers and simplified events board selection, schedule/champions rendering and moderation query construction.
- Included all existing tests in the appeal test script; fixed a malformed pre-existing escaped assertion exposed by that coverage.

## Refine / verification
npm test: all 56 unique tests passed (the existing potion command also repeats 3 of those). npm run build passed. Appeal, reviewer and moderation pages passed browser checks at 390px and 1440px.

Browser checks use Edge and fixtures/mocked unavailable APIs. They do not establish real mobile device, live API, Safari, or production acceptance.

## Remaining findings and delivery
Browser fetch calls are incorrectly labeled server-side SSRF by the analyzer; canonical IDs and same-origin paths are now explicit. Four verified browser-only SSRF false positives have rule-specific inline annotations at their validated request arguments. Only rules_lgpl.javascript.ssrf.rule-node-ssrf is annotated; UUID validation and behavioral tests remain active. No organization rule configuration was changed. Fresh analysis cleared the original complexity/test-key findings; hosted analysis must confirm these targeted annotations.

- [x] Inspect comments and current base.
- [x] Implement supported fixes and focused behavioral regressions.
- [x] Run relevant local tests/build and inspect changed integration contracts.
- [ ] Confirm hosted checks and fresh Codacy analysis at the delivered commit (recorded in the follow-up PR or final handoff).
- [ ] Resolve remaining analyzer configuration/complexity findings where applicable.

No merge, production deployment, live wiki publication, or global rule disabling was performed. The connected account can update fork-owned PRs #46/#47 directly; fixes to owner-owned branches are delivered as follow-up PRs targeting those original branches.
