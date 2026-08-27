# Codacy baseline — 2026-08-27

This report records the completed Codacy analysis for pull request 6 at commit
`255ec37c9945f99e66940673e5c858e5c61a56de`. It does not claim that the branch
meets the Codacy gate or that the website is ready for production.

## Current checkpoint

The pull-request analysis reports:

- 1,047 new issues;
- 7,317 delta complexity;
- 901 delta clones;
- a failed zero-new-issues gate.

The `dev/competitions` branch has 1,445 active issues:

| Language | Active issues |
| --- | ---: |
| JavaScript | 945 |
| SQL | 287 |
| CSS | 162 |
| Python | 34 |
| Java | 17 |

The focused cleanup reduced the pull-request total from 1,102 to 1,047 and the
Java total from 39 to 17. The same checkpoint passed 288 website tests, the site
build and validation, and 14 Java 21 Competition Bridge tests.

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
- handled the account page's startup promise;
- removed dynamic array property access from the appeal formatter;
- retried transient R2 cleanup failures for appeal evidence instead of silently
  abandoning the object;
- removed avoidable duplicate literals, null control flow, and parameter
  reassignment in reward delivery.

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
this repository. No findings were ignored, no first-party paths were excluded,
and no source suppressions were added to make the totals appear lower.

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
measure of the active branch.
