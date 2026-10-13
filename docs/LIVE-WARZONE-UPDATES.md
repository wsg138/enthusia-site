# Live Warzone update continuation

Owner request: add automatic MaceGuard rotation and live WarzoneDuels information
to website PR 53. Preserve the cream/red/gold layout and public player heads.

## Requirements and acceptance

- Publish effective runtime rotation, manual override, transition and next kit;
  never infer the active kit by reading a stale configuration file.
- Export counted match wins for an explicit UTC Monday week. Team matches count
  each persisted winning participant once; legacy single-player records remain
  supported. Draws, cancelled/unrecorded matches, opponents and wagers are excluded.
- Distinguish complete bounded results, partial leaders, known zero and unavailable.
  Live results take precedence over old profile captures; obsolete weeks are not
  relabeled as this week.
- Refresh visible website views without overlapping requests; stop on navigation,
  pause while hidden, and retain honest stale/unavailable indicators on failure.
- Signed deliveries remain authenticated and monotonic. Secrets stay outside Git.

Use manual SPEAR evidence; website and the current companion exporter checkouts
have no project-local EARS/state helpers. New regressions are exercised before
repairs. Producer tests and fixture previews are distinct from live acceptance.

## Activation boundary

Canonical website main is 309a9a0, MaceGuard main 38e4255, and Duels main 480a365.
Read-only server inspection on 13 October confirms MaceGuard runtime
6.1.8-water-riptide-test.8 (installed JAR SHA-256
ae552ae7c11d9a35352f0164aa4a17b819211e5fc639bf5266aa18c8808bbde5) and Duels
1.0.4. Standalone Rotator is absent. No website-export configuration is installed.
Duels JAR contents could not be fetched through the bounded contents API; its
runtime startup version is confirmed, not exact source provenance.

Server activation must use merged canonical code and verified network pins,
preserve the installed combat/team features, receive the matching ingest secret
through operator-managed environment configuration, and pass real signed delivery.
Do not deploy older canonical Duels 1.0.1 over installed 1.0.4 or replace the
MaceGuard test runtime with an unverified build. No production write has occurred.

## Tasks

- [x] Regress and repair participant-aware weekly aggregation and complete results.
- [x] Publish explicit week/freshness metadata with effective MaceGuard rotation.
- [x] Connect live metadata and refreshing website/profile rendering.
- [x] Verify local builds, signed end-to-end ingestion and interactive preview.
- [x] Deliver companion source and update PR 53 with exact activation dependencies.
- [ ] Reconcile merged runtime provenance/pins, configure environment, activate and
  verify consecutive live deliveries and a completed duel result.

## Delivered source and proof

- [MaceGuard PR 48](https://github.com/wsg138/MaceGuard/pull/48): effective
  rotation captured on-thread; bounded signed delivery and optional public Duels
  reader off-thread. Five-minute producer interval is explicitly opt-in.
- [Duels PR 24](https://github.com/wsg138/WarzoneDuels/pull/24): native persisted
  team winner credits, legacy records, deterministic names/ties, 500-row bound,
  completeness and query timeout. It does not infer teammates or read a copy of
  an active database. Missing team credits fail closed.
- [Website PR 53](https://github.com/wsg138/enthusia-site/pull/53): metadata
  projection, explicit current-week/zero/unknown semantics and minute refreshes
  for visible home/profile views. Hidden views pause; navigation cancels requests.

The team-member and discarded-week regressions failed before repairs. Real H2
tests also exposed a bounded-query performance failure; the final derived-table
window query passes the 501-winner boundary without increasing its timeout.
Native H2 -> actual MaceGuard DTO/signature -> signed ingest -> SQLite -> public
Warzone feed passes, with replay denial and no private opponent fields. The
fixture uses test keys and performs no HTTP production delivery.

Local verification: 565 website tests plus lint, page/map checks, static build
and Pages compilation; 38 Duels tests/clean Maven verify; 539 MaceGuard tests/
clean Java 21 Maven verify. One later online MaceGuard test-discovery run missed
a provided Bukkit class; an offline clean build with the resolved dependency
cache passed all 539 tests. It was not a behavioral test failure or a skipped test.

Browser checks cover connected, empty, stale, paused and unavailable states,
loaded winner heads, and actual minute refreshes. At 390px the document width is
375px with no overflow. The synthetic check uses actual production markup and
renderer; its initial data comes from the native contract fixture. Subsequent
dates/counts deliberately simulate updates and are clearly labeled.

## Exact production gates

Canonical plugin access is read-only for this account (GitHub push=false).
A maintainer must review/merge the exporter changes and reconcile runtime
lineage, including existing MaceGuard #46 and Duels #22. The network's fetched
main 559bfabc currently pins MaceGuard e18093c and Duels 475d245. Update those
pins through its reviewed workflow only after the runtime-preserving source is
merged. Do not point production at these unmerged test candidates.

After canonical clean builds are verified, supply the matching
COMMUNITY_INGEST_SECRET in the server environment and Cloudflare production
secrets. Do not read back, commit, copy to chat or silently rotate credentials.
The operator must supply the existing secret or coordinate an explicit secure
rotation. The reviewed operator config is:

```yaml
# plugins/MaceGuard/website-export.yml
enabled: true
endpoint: "https://enthusia.info/api/community/ingest"
secret-environment-variable: "COMMUNITY_INGEST_SECRET"
interval-seconds: 300
```

Deploy the merged website metadata/refresh code, install the verified canonical
runtime at an authorized restart time, and verify two advancing generatedAt
values five minutes apart. Verify a counted duel updates the actual winning
participant(s) and that a fresh complete export confirms a known-zero profile.
Check manual override, next transition, outage/stale behavior and Monday rollover.
Rollback disables the exporter and restarts it; leave combat settings intact.
The live GET remains HTTP 503 until a verified producer supplies its first
snapshot. No live activation, secret change, server mutation or restart occurred.

Initial hosted findings were inspected for the exact companion heads. Applicable
complexity/duplication and optional-result handling were refactored. Java EE's
thread prohibition does not apply to this Paper plugin; LinkedHashMaps are local
builders published as immutable values rather than concurrently mutated stores.
Credential-free in-memory H2 URLs contain no passwords. One ConfigLoaderTest
string warning points to unchanged baseline code. No blanket suppression or
clean hosted grade is claimed; hosted checks remain separate from local proof.

Hosted checkpoint: website head 4fa622b passes GitHub validation and Codacy;
Duels head 4ff293f passes Codacy. MaceGuard head 1380a10 retains nine context
annotations (five Java EE thread rules, three local map builders and the unchanged
ConfigLoaderTest string). Companion Actions runs report action_required and need
maintainer approval: MaceGuard Build 38435430531 / Codacy Analysis 38435430496,
Duels Tests 38434487401. CodeRabbit skips automatic review for these OSS repos.
These are not hosted test successes for the plugins and do not permit activation.
