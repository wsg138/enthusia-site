# Local market history and review continuation

Canonical website main bcc9d25 and market main 14351db were fetched and compared
with the ongoing isolated branches. Neither has new base commits to incorporate.
Preserve the generated preview timestamp and existing private capture files.
The owner subsequently authorized a website PR on 13 October. Production
changes and deployment remain outside this delivery.

## Spec

- Persist the consumed ledger cursor atomically with a sales page, including the
  final page and pages containing only BUY records; restart must not rescan them.
- Keep compatibility with feeds that supply only nextCursor. Reject malformed
  or backwards explicit checkpoints before any persistence.
- Show quantity-weighted completed-sale history, actual UTC sale dates and
  unavailable comparisons. Never label unknown changes as risers/fallers or infer
  historical owner/guild attribution from today's stalls.
- Refactor applicable saved review findings by responsibility while preserving
  authentication, revision checks, transactions, retry and public projections.
- Separate local contract proof, hosted analyzer results and live activation.

## SPEAR

Use the existing SPEAR brownfield workflow. The website has no local EARS/state
helpers; this record tracks spec, prove, engine, architecture and refine. Market
requirements/implementation/tasks and its local export record were inspected.
Meaningful new integration regressions must fail before repairs; refactoring
uses existing behavioral coverage and must not claim fabricated red/green proof.

## Tasks

- [x] Reproduce and repair final-page checkpoint loss across producer and worker.
- [x] Verify producer DTO -> worker -> SQLite -> public insights end to end locally.
- [x] Repair history presentation and applicable market review findings.
- [x] Refactor additional actionable findings and refresh per-finding evidence.
- [ ] Complete the remaining maintainability backlog and obtain hosted analysis.
- [x] Run canonical local checks and provide a labeled interactive contract preview.

Backups and real live sales activation remain separate gates. Fixture data must
not replace captured real player data or appear as live transactions.

## Local evidence, 13 October

The final-page and BUY-only cursor regressions failed before the repair. The
worker now persists terminal checkpoints atomically, rejects invalid cursors,
and prevents overlapping sync runs from moving numeric checkpoints backwards.
Feeds with only nextCursor remain supported. The companion Market producer is
still a separate local candidate; this website PR does not install it.

Native SQLite -> authenticated producer HTTP -> sync -> SQLite -> public insights
passes using the explicitly synthetic producer test fixture. No real transaction
or ownership history is invented. Sparse charts use actual UTC days; unrecorded
comparisons and historical attribution stay unavailable.

Additional appeal, gallery, competition and UI refactors preserve permission
checks, revision conditions and transactional ordering. The refreshed triage of
317 saved findings records 102 maintainability entries still open, 136 below
local AST thresholds, 13 changed/pending hosted analysis, 40 verified safe and 26
analyzer/runtime mismatches. The reduction includes parser/measurement corrections
as well as refactors; it is not a clean hosted analyzer result.

The preferred full-body player skin, red/gold hero and separate Stats panel now
also render captured real profiles. Guild, market and weekly win data remain
limited by their captured source; full guild/quest/achievement imports still
require the documented consistent backups.

Local checks after integrating canonical main 309a9a0: 561 website tests, lint,
site validation, 15-building/71-stall/94-shop map validation, six offline exporter
tests, the static build and Pages Functions compilation pass. The competition
bridge passes clean Maven verify on both the default and Paper 26.2 API profiles.
CI now also runs the offline exporter tests; hosted results remain pending.
The interactive market check is synthetic and read-only; captured profile views
remain separately labeled. Localhost preview links are computer-only, not hosted
mobile-accessible links. No source change here activates a feed or sends Discord.
