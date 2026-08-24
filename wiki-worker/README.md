# Enthusia Wiki Worker

This directory owns the guarded publication path from the approved Enthusia wiki preview to the live Miraheze wiki.

## Source

The approved player-facing content is loaded from `public/wiki-demo/v2-*.js` on the publishing branch. Existing community-authored player, guild, staff, mapart, template and lore pages are not generated or replaced by this worker.

## Required gates

The `Publish Enthusia wiki` workflow performs these steps in order:

1. Read the current public Miraheze revision set.
2. Compare it with the immutable pre-redesign baseline stored on `wsg138/EnthusiaSentinel-Docs:wiki-preservation-baseline`.
3. Render the approved preview content into MediaWiki source.
4. Reject known stale/non-player content and verify key server documentation is present.
5. Parse every generated wikitext page through Miraheze's public `action=parse` API without editing anything.
6. Preserve unrelated community edits and refuse publication only when a page the worker intends to modify has drifted since the baseline.
7. Require repository Actions secrets for the approved Miraheze BotPassword account.
8. Re-read every target and verify its revision again immediately before editing.
9. Save every target's complete pre-edit source and revision metadata.
10. Publish `MediaWiki:Common.css` first, normal pages next and `Main Page` last.
11. Re-read every successful edit and verify the stored source matches the intended content.
12. Upload preflight, pre-edit, post-edit and publish-report artifacts for rollback/audit.

The worker has no delete operation.

## Credentials

Configure these GitHub Actions repository secrets in `wsg138/enthusia-site`:

- `WIKI_BOT_USERNAME` — the Miraheze BotPassword login username (normally the parent wiki username plus the bot-password suffix).
- `WIKI_BOT_PASSWORD` — the BotPassword value.

The workflow also accepts the legacy fallback names `MIRAHEZE_BOT_USERNAME` / `MIRAHEZE_BOT_PASSWORD` or `WIKI_USERNAME` / `WIKI_PASSWORD`, but the `WIKI_BOT_*` names are canonical.

Secrets must never be committed to the repository or written into workflow files.

## Publishing

The worker can be started with `workflow_dispatch` or by updating `wiki-publish-trigger.txt` on the same-repository wiki source PR. The trigger is only a request; all safety gates still run before any authenticated edit.

If any target page changes after preflight, MediaWiki `basetimestamp` checking and the worker's revision check stop the run rather than overwrite the newer edit.
