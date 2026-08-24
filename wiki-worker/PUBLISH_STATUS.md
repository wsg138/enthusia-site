# Enthusia Wiki v2 Publication Status

Status: **LIVE AND VERIFIED**

Published: 2026-08-24

## Live publication

- Successful migration run: `32728260912`
- Main Page was deliberately published last: revision `635`
- Final live target count: 31 managed targets
- Styling is scoped through `Template:EnthusiaWiki/styles.css` using TemplateStyles.
- No existing player, guild, staff, mapart, or other community article was replaced by the migration.

## Preservation

Original immutable preservation baseline:
- Captured: `2026-08-23T04:29:21Z`
- Page count: 167
- Repository/branch: `wsg138/EnthusiaSentinel-Docs:wiki-preservation-baseline`

Last complete backup before the successful resume publish:
- Run: `32728260912`
- Artifact: `9520384533`
- SHA-256: `8be182d835ecbc8ad8e8fd6ecd7d3370610aea7dcadd5f2cc509b51a05eacbec`
- Captured 175 pages and 175 complete revision-history files, including the partial worker progress from the prior rate-limited attempt.

Complete post-publish verification backup:
- Run: `32728846920`
- Artifact: `9520597524`
- SHA-256: `610fd68a35106d4f5f1c8eb3bd4bd351accdc4fdbc5875a98386b14aadd283b2`
- Captured: `2026-08-24T12:46:49Z`
- Page count: 197
- Histories: 197

Final verification evidence:
- Run: `32728846920`
- Artifact: `9520607812`
- SHA-256: `92fd995ab355b268e6c5b3d3da8a82f9c101978981a2bd37af57f8e1ae07d6d2`
- Every one of the 31 managed targets was reported `ALREADY CURRENT`.
- The verification run made zero wiki edits.

## Community edit preservation

The only human/community change found after the original preservation baseline and before migration was:
- `SonOfBlood`
- revision `604`
- timestamp `2026-08-23T11:39:04Z`
- editor `SonOfBlood`

That revision was included in the full pre-publish backups, was never a publication target, remained revision 604 after migration, and was explicitly re-confirmed in the final post-publish verification.

## Safety behavior for future publishes

The permanent worker lives under `.github/workflows/wiki-publisher.yml` and `wiki-worker/`.

Future runs:
1. Capture a complete fresh wiki backup before editing.
2. Compare current pages with the preserved baseline and approved source.
3. Refuse to overwrite a changed managed page unless its content exactly matches prior worker output.
4. Preserve unrelated community edits.
5. Validate generated pages through Miraheze's parser.
6. Enforce player-facing content guardrails.
7. Use BotPassword credentials from GitHub Actions secrets only.
8. Use revision/timestamp conflict checks and post-edit readback verification.
9. Pace writes and retry Miraheze rate limits.
10. Publish Main Page last.

The workflow is now triggered only by an explicit `wiki-publish-trigger.txt` change or manual `workflow_dispatch`; normal preview/source edits do not automatically publish the live wiki.
