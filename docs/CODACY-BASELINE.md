# Codacy baseline — 2026-08-30

This report records the completed Codacy analysis for pull request 6 at commit
`99088a718429e0f4acfe3d9e9cc21bd6567a06f5`. It does not claim that the branch
meets the Codacy gate or that the website is ready for production.

## Current checkpoint

The hosted `dev/competitions` branch report has 1,525 active issues and still
fails the pull request's zero-new-issues gate:

| Language | Active issues |
| --- | ---: |
| JavaScript | 1,025 |
| SQL | 287 |
| CSS | 162 |
| Python | 34 |
| Java | 17 |

| Category | Active issues |
| --- | ---: |
| Best practice | 105 |
| Compatibility | 482 |
| Performance | 32 |
| Security | 201 |
| Error prone | 473 |
| Complexity | 232 |

The active severities are 718 high, 756 warning, and 51 error findings. The
latest source checkpoint passed the production build, validation of all 19 HTML
pages, and all 337 website tests. The Competition Bridge's 14 Java 21 tests also
passed at its latest completed checkpoint.

## Valid findings resolved

The cleanup included the following source fixes:

- removed dynamic SQL from the Competition Bridge schema migration;
- replaced a high-NPath status implementation with one fixed aggregate query;
- decomposed bridge configuration, request routing, reward handling, command
  handling, and reward transactions;
- replaced public Gallery HTML construction with DOM and text APIs;
- added explicit locale handling and exception serialization metadata;
- removed unused bridge runtime state and clarified persistence invariants;
- moved link-code serialization from the public object monitor to a private
  lock without changing transaction boundaries;
- made manual competition entry creation atomic with lifecycle, version,
  identity, type, and entry-cap checks;
- made player and guild draft creation atomic with lifecycle, version,
  participant, guild, and entry-cap checks;
- decomposed the participant-context endpoint and competition submission
  creation paths below the configured complexity threshold;
- handled the account page's startup promise;
- removed dynamic array property access from the appeal formatter;
- retried transient R2 cleanup failures for appeal evidence instead of silently
  abandoning the object;
- removed avoidable duplicate literals, null control flow, and parameter
  reassignment in reward delivery.

The most recent cleanup reduced the branch total from 1,529 to 1,525. Two test
identifiers that resembled Discord client IDs were replaced with clearly
synthetic values. Two findings that treated JSON document serialization as
object-key generation were consolidated behind `serializeJsonDocument`. That
function has one line-level Semgrep annotation because these values are stored
documents and never object keys; key-order stability is not part of their
contract.

## Analyzer configuration mismatch

Codacy's linked `Default coding standard` enables patterns for runtimes and
frameworks that this repository does not use. The current branch totals include:

- 101 findings requiring every table name to start with `RAC_`;
- 116 T-SQL session-directive findings against Cloudflare D1/SQLite migrations;
- 70 ANSI-parser errors on valid SQLite features such as `PRAGMA`, triggers,
  `NEW`, `OLD`, and `INSERT OR IGNORE`;
- 162 SCSS/obsolete-attribute findings emitted at the first line of plain CSS
  files;
- Salesforce Lightning, Flow, ES5, Opera Mini, Node.js 16, and functional-style
  restrictions applied to modern browser, Node.js 22, and Cloudflare code;
- J2EE threading and classloader rules applied to a Bukkit/Paper plugin.

Codacy currently rejects repository overrides for patterns enforced by the
linked standard. Issue-level false-positive writes are also unavailable for
this repository. No issues were ignored, no first-party paths were excluded,
and no global rules were disabled. The one source annotation described above is
limited to a proven, repeated false positive at the serialization boundary.

## Reviewed Java findings left visible

The 17 remaining Java findings are retained for review:

- six lifecycle reference clears reported as null assignment;
- three Bukkit plugin classloader lookups reported under a J2EE rule;
- three owned HTTP executor findings reported under a J2EE thread rule;
- three required per-response or per-stack allocations reported as loop
  allocations;
- one `Map` returned by Bukkit reported as an application-owned map that should
  be concurrent;
- one inbound HTTP listener bind reported as outbound SSRF.

Changing these solely to satisfy the current patterns would weaken lifecycle
cleanup, classloader correctness, request isolation, or Bukkit inventory
behavior. They should be revisited if a runtime-specific review finds a concrete
defect.

## Required Codacy configuration work

Replace the linked catch-all standard with a repository-specific standard that:

1. keeps applicable security, correctness, complexity, and maintainability
   analysis enabled;
2. targets modern browsers, Node.js 22, Cloudflare Pages/Workers, SQLite/D1,
   Python 3, and Java 21 Bukkit/Paper code;
3. disables only framework-specific patterns for unused platforms;
4. permits reviewed false positives to be recorded with a reason;
5. reruns the branch before any grade or production-readiness claim.

The original 44-issue baseline from 2026-08-22 predated the competition,
appeals, Gallery, Wiki worker, and bridge additions and is no longer a useful
measure of the active branch. The 1,525 total includes valid work still to
remediate as well as the analyzer mismatches above; it must not be presented as
an A-grade or clean result.
