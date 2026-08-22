# Codacy baseline — 2026-08-22

This document records the 44 Codacy findings reviewed before the Competitions work began.

## Runtime reality

`enthusia-site` contains multiple JavaScript runtimes:

- Cloudflare Pages Functions run in the Cloudflare Workers runtime.
- Browser assets target modern browsers used by the public Enthusia site.
- Repository build/validation scripts run on Node.js 22 in GitHub Actions.
- Files under `tools/` are local development utilities and are not production browser code.

The current Codacy pattern set is applying several incompatible assumptions at once, including ES5/Opera Mini compatibility, Node.js 16 runtime restrictions, and Flow parameter annotations. Those assumptions do not match this repository.

## Reviewed findings

### Analyzer/runtime mismatches — do not rewrite code to satisfy these

The following reported patterns are not defects in this repository and should be disabled or replaced with rules matching the actual runtime:

- Disallow Block-Scoped Variables (`const` / `let`).
- Require Parameter Type Annotations in Flowtype.
- Disallow Unsupported Node.js Built-in APIs when applied to Cloudflare Pages Functions.
- Enforce Cross-Browser API Compatibility for Opera Mini on server-side Pages Functions.
- Disallow Template Literals.
- Disallow async/await syntax.
- Disallow Async Function Declarations.
- Disallow ES2015 modules.
- Disallow ES2015 property shorthand.
- Disallow `JSON` / `Array.isArray` as ES5-incompatible APIs.
- Report `fetch`, `Response`, and `URL` as unsupported or experimental Node.js APIs inside Pages Functions.

In particular, `functions/api/leaderboards/[[path]].js` is Cloudflare Pages Function code. Replacing `fetch`, `Response`, `URL`, modules, `const`, or `async/await` to make ES5/Node-16 compatibility rules green would make the source less representative of its deployed runtime.

### Geometry numeric literals — intentional

The findings on `public/assets/market/map-core.js` for `1e-12` and `1e-9` are intentional numerical tolerances/fallbacks used by geometry calculations. They are not financial or exact-integer values and do not represent inaccurate numeric literals for this use case.

### Trailing commas in the cinematic mask editor

The two trailing-comma findings in `tools/cinematic-mask-editor/editor.js` are formatting/style findings, not runtime defects. They are not release blockers.

## Action

1. Keep modern Cloudflare/browser JavaScript as modern JavaScript.
2. Do not add Flow annotations solely for Codacy.
3. Do not downgrade Pages Function source to ES5 or Node.js 16 compatibility.
4. Configure Codacy's JavaScript tooling/patterns to reflect modern browser code, Node.js 22 build scripts, and Cloudflare Workers/Pages Functions.
5. Continue treating legitimate security, correctness, maintainability, and error-handling findings as actionable.
6. Re-run Codacy after the analyzer pattern set is corrected and review any remaining findings individually.

No broad source-level suppressions should be added merely to make the grade green.
