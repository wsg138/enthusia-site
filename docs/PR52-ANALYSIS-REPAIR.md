# PR 52 analysis repair

## Spec and tasks

Canonical main was fetched on 12 October 2026 at cdcd8aaba6bd95ec844b341c6e694f795f36bd2f. This isolated checkout includes the five prepared skin/guild fixes at c9e80a7; the original checkout and its generated preview changes are preserved. No new PR or production deployment is authorized.

Requirements:
- R1: Browser API requests must stay within their intended local API namespaces. Reject invalid identifiers, traversal, alternate origins and unsupported actions before fetch.
- R2: Preserve staff authorization, optimistic versions, idempotency, transaction boundaries, Discord mention restrictions and retry semantics.
- R3: Correct applicable analysis findings without altering design or suppressing broad security rules. Record proven analyzer mismatches separately.
- R4: Check meaningful regressions, lint, site validation, build and existing tests. Hosted analysis is a separate gate.

No project-local EARS validator/state helpers exist. This file records the manual SPEAR sequence: spec, prove, engine, architecture and refine.

## Prove

PR 52 is merged at 1a46c623983c9f5e88a3bdde4987fb93146bdcdc. Its Codacy page reports 317 new issues but displays only the first 100. The GitHub summary refers to those 100: 9 critical, 40 high, 49 medium, 2 minor. All 317 records were subsequently retrieved through the [documented public Codacy API](https://api.codacy.com/api/api-docs), following its returned pagination cursors. They are preserved in [52-findings.json](pr-feedback/52-findings.json).

Existing browser route validations already constrain appeal UUIDs and binding destinations. Community API suffixes lacked a common traversal/query boundary. A new regression failed because traversal reached fetch, then passed after repair. A separate preview-dispatch regression demonstrated an inherited function being invoked, then passed after the registry repair. Existing tests are not historical red/green evidence.

## Engine / architecture / refine

- The community browser adapter now accepts known public/admin routes, validates decoded poll slugs, restricts query keys to insights, and rejects duplicate/unsupported query fields, traversal and fragments. Credentials are fixed to same-origin and redirects are rejected.
- Design reference preview handlers are registered from own function properties in a Map; inherited properties cannot dispatch. Normal event/month controls still work in the browser. This affects preview infrastructure, not the visual design.
- Separated Discord DM channel creation, message posting and outbox delivery responsibilities. Mention restrictions, claim order, retry persistence and optional configuration semantics are preserved.
- Split standings input/state/computation/persistence, reward confirmation, judge identity/roster updates, and owned attachment/media lookup. Authentication and authorization still precede data access.
- Split community routing into authenticated editor, poll, alert, public snapshot and guild fallback responsibilities. Existing transaction/revision, signed producer nonce/replay, poll closing/options, alert opt-out/limit and public projection checks remain in place.
- Simplified trusted wiki URL comparisons without weakening origin, port, credentials, query or fragment restrictions; separated public punishment projection from validation.
- Replaced literal replaceAll calls with equivalent global replacements, grouped equivalent CSS exclusions, and made community startup return consistently. No broad analysis rule was disabled or finding hidden with an annotation.

## Verification

All 503 tests, lint, site references, market/map checks and static build passed. Wrangler 4.149.0 compiled the Pages Functions successfully with compatibility date 2026-08-22. Tests include new failing-then-passing route and inherited-handler regressions, and existing privacy, permissions, optimistic concurrency, signed producer replay, atomic persistence, reward idempotency and Discord retry contracts. Direct Python URL boundary checks passed using the bundled Python runtime.

Local browser: design reference Events category filtering and month navigation passed; combined preview market data loaded and item search worked without console errors. Preview API responses are simulated and writes are blocked. No live sign-in, Discord message, payment or production test was performed.

## Per-finding disposition and outstanding work

[52-dispositions.json](pr-feedback/52-dispositions.json) records all 317 original findings. Run `node scripts/triage-pr52.mjs` after source changes to refresh its local evidence. It is a triage helper using the locked ESLint/Acorn development toolchain, not an EARS validator or a replacement for Codacy.

| Local disposition | Count | Meaning |
| --- | ---: | --- |
| Changed, hosted analysis pending | 13 | Source repairs for API boundary, preview dispatch, equivalent compatibility/style forms, consistent return and wiki URL complexity. |
| Below threshold in current local AST | 56 | Includes prior source repairs and parser discrepancies; fresh hosted results are still needed. |
| Verified safe in context | 40 | Intentional Number literals, JSON document serialization, constrained browser API requests and fixed test source reads. |
| Analyzer/runtime mismatch | 26 | T-SQL/ANSI/RAC rules applied to D1 SQLite, plus generated dependency lockfile size. |
| Maintainability open | 182 | Complex or long business/UI functions, large modules, retained design examples, and ambiguous parser locations. These are not claimed fixed. |

The 182 open entries are a substantial separate decomposition backlog. They must not be labeled false positives as a group. Some reported function spans include embedded SQL/CSS or regex parser errors and need individual verification. Existing [Codacy baseline](CODACY-BASELINE.md) describes the linked coding-standard mismatch; a repository administrator must align it with the supported runtimes while keeping applicable security rules enabled.

No clean Codacy grade or hosted-check success is claimed. PR 52 is already merged; fixes are prepared on a fork branch with no new PR, canonical write/merge or production deployment. Production remains on hold at the user's request.
