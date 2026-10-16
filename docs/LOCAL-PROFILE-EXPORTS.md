# Local profile export and backup checklist

No PR, production installation, server operation or publication is part of this
workflow. Keep raw archives, databases and configs outside `public/` and Git.
Tools have no networking, rewards, claims, grants or Discord delivery operations.
Manual SPEAR applies; no local EARS/state helper exists for these scripts.

## Exact backup contents

Preserve these paths relative to a single private backup directory:

| Files | Purpose |
| --- | --- |
| `plugins/LumaGuilds/lumaguilds.db` | All guilds, requested memberships, stored banner designs and quest sets/progress |
| `plugins/LumaGuilds/progression.yml` | Matching current quest bonus and default placement reward policy |
| `plugins/LumaGuilds/config.yml` | Matching storage/runtime configuration and local provider registration |
| `plugins/UltimateAdvancementAPI/database.db` | Saved rendered player completion; current server uses SQLite |
| `plugins/UltimateAdvancementAPI/config.yml` | Verify the storage type and local UAA configuration |

For a matching registered achievement catalogue, also provide the **whole**
provider/config folders `plugins/EnthusiaAdvancements/`,
`plugins/EnthusiaLoreItems/`, and `plugins/EnthusiaKOTH/`, plus these installed
JARs observed read-only on 13 October 2026:

- `plugins/LumaGuilds-3.0.23.jar`
- `plugins/EnthusiaAdvancements-pilot.6-discord-test.3.jar`
- `plugins/UltimateAdvancementAPI-Plugin-2.8.1-loading-guard-test.1.jar`
- `plugins/EnthusiaLoreItems.jar`
- `plugins/EnthusiaKOTH-0.2.0.jar`

Record the original backup capture time in UTC, plugin versions and hashes.
The renderer itself has no authoritative standalone tree files; providers
register its current definitions. Extra companion dependencies may be needed
to start the isolated local provider restore, determined from these versions.

Prefer clean SQLite Backup API snapshots (`sqlite-backup`) produced by the
backup operator. Alternatively supply files from an already stopped server or
one consistent storage snapshot (`offline-files`). **Do not copy a running
`.db` alone.** If a snapshot contains nonempty `lumaguilds.db-wal` or
`database.db-wal`, include that matching sidecar from the same instant. The
reader recovers it on a temporary local copy; `-shm` is rebuilt there and is not
required. A nonempty rollback `-journal` is rejected: obtain a clean backup.
This task does not authorize stopping the production server or creating a
production backup. Hashes detect tampering/local changes, not original backup
consistency; that provenance must be established by the backup operator.

## Registered catalogue on an isolated local restore

Use copies, never original backup files. Bind any local server to loopback,
disable Discord delivery and external integrations in the copied configuration,
and do not point providers at production databases. The local candidate renderer
has an opt-in `website.local-catalogue-export: true` setting. From its **local
console**, run `enthusia-export-catalogue`. It captures registered definitions
only into `plugins/EnthusiaAdvancements/website-export/registered-achievement-catalogue.json`.
Copy that JSON to the private backup root as `registered-achievement-catalogue.json`.
An empty registry is rejected; fix provider registration before proceeding.
This command is disabled by default, console-only, and has no reward/progress
operations. The separate loaded-player completion API is also opt-in and
defaults disabled; offline completion extraction does not require enabling it.

Confirm the catalogue came from matching provider versions/configs and the
restored backup before setting `--catalogue-matches-backup`. No bundled defaults,
roots or removed nodes are assumed. These are captured **renderer completions**,
not a guarantee of provider reward entitlement. Shared UAA teams and missing
players stay unknown; they are never attributed to an individual profile.

## Commands

Python 3.11+ with `scripts/requirements-profile-export.txt` installed is needed.
Use the actual capture time below, not the time when export is run:

```powershell
python scripts/prepare-profile-backup-manifest.py --backup-root C:/private/enthusia-backup --captured-at <backup-time-UTC> --consistency sqlite-backup --catalogue-matches-backup
python scripts/export-profile-backups.py --manifest C:/private/enthusia-backup/backup-manifest.json --profiles public/preview/real-player-data.json --output C:/private/profile-bundle.json
node scripts/import-profile-capture.mjs public/preview/real-player-data.json C:/private/profile-bundle.json C:/private/validated-profile-import.json
```

The manifest records known input hashes. Add matching JAR/config paths using
`--extra-file` if needed. It declares supplied provenance; it does not create a
backup or certify consistency. Outputs cannot replace input files. Export fails
on unknown schema, mismatched checksums, ambiguous active banners/quest sets,
unverified sidecars, out-of-directory paths or incompatible catalogue scope.
No data is published. All import validation completes before atomic replacement.
Fields outside the public contracts are dropped, and unknown requested
completion identities clear previous completion claims rather than preserving
a false current result.

Use the validated local import envelope as the fifth input argument to
`scripts/build-real-player-preview.mjs` after the public board, market and guild
board capture files. The builder can import full guild cards, quest standings
and the registered catalogue. Raw bundles are still supported, but the validated
envelope is the recommended operator workflow. The existing real capture remains unchanged until
you deliberately rebuild from the validated real backup bundle.

## Acceptance and proof

Requirements: query SQLite read-only; never grant or redeem; do not expose homes,
internal ranks, banner submitters, claim actors, other-player rosters, secrets or
unregistered advancement records. Preserve decimal Long quest counts and server
tie order. Use current captured quest policy, not guessed historical defaults.
Quest standings remain bounded to 50 per objective and explicitly partial.
Backup input hashes must be unchanged after export.

Tests use synthetic SQLite schemas checked against LumaGuilds source and the
installed UAA 2.8.1 API dependency's SQLite schema. This is local contract proof,
not complete real-server data acceptance. Real acceptance requires the requested
backup set and matching registered catalogue. The active server database and
real guild/banner/quest/achievement coverage are not changed by these tools.

Verified locally: 553 website tests, 6 real-SQLite fixture tests, lint/page/map
checks, static build and Pages Functions compilation pass. The renderer's
canonical pilot Maven verify passes 45 tests and builds its unmerged local
candidate. Export-to-import round trips preserve Long counts; input checksum,
path/WAL/journal, shared-team, removed-node, privacy and rejected-output cases
pass. Fixtures never replace the existing real-data preview. No PR, remote push,
server installation, backup operation or production change occurred.
