# Last Enthusia wiki publication

Status: **SUCCESS**

## Successful verification run

- GitHub Actions run: `32728260912`
- Workflow: `Publish Enthusia wiki`
- Final job conclusion: `success`
- Source branch: `wiki-demo`
- Source commit: `335563ebce370cd27895a5dd719f54eb588f9993`
- Final verification time: 2026-08-24T13:33Z

## Fresh full backup

The successful verification run captured the complete live wiki before its no-op publish verification:

- 197 current wiki pages
- 197 per-page history files
- 21 contributors represented in the captured histories
- Artifact: `enthusia-wiki-full-pre-publish-backup-32728260912`
- Artifact ID: `9522250476`
- SHA-256: `f0f4a43f987ab4a1ce96d3a8f0ca4ffd813513b403879f8bf2b37a9f4de599d1`
- Created: `2026-08-24T13:33:23Z`
- Retention expiry: `2026-11-22T13:32:35Z`

This backup includes the fully migrated wiki state, including the previously published redesign pages and the preserved community edit to `SonOfBlood`.

## Publish evidence

- Artifact: `enthusia-wiki-publish-evidence-32728260912`
- Artifact ID: `9522259134`
- SHA-256: `0e80d62d77920bc5244d8a86581fd89d7cea62f65428ccf7dd033d139e12abad`
- Created: `2026-08-24T13:33:38Z`

The evidence records all 31 managed targets as `ALREADY CURRENT`, meaning the live source matched the approved rendered source exactly during the final verification pass.

## Managed targets

The worker manages 31 targets: 30 player-facing wiki pages plus `Template:EnthusiaWiki/styles.css`. The final verification pass confirmed all 31 exact matches.

`Main Page` was already at worker revision 635 and matched the approved source exactly. The unrelated `SonOfBlood` community edit (revision 604) was preserved and was never a publish target.

## Safety properties retained

The worker still performs a complete fresh backup before publication, compares live changes to the original preservation baseline, refuses to overwrite divergent target pages, validates generated pages through Miraheze's parser, checks TemplateStyles availability, enforces player-facing content guardrails, authenticates through repository secrets, uses revision/race checks, performs readback verification, and keeps Main Page last when edits are required.
