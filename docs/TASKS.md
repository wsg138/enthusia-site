# Remaining local real-data tasks

Keep this work local. No PR, deployment, production installation or server
operation is authorized by this checklist.

## Backup collection and import

- [ ] Collect one consistent backup set with its original UTC capture time,
  plugin versions and file hashes. Use the exact files, provider folders and
  matching JARs listed in [the backup guide](LOCAL-PROFILE-EXPORTS.md).
- [ ] Include matching SQLite WAL sidecars when present. Do not use a database
  copied alone from a running server or a set with a nonempty rollback journal.
- [ ] Restore copies in an isolated local environment, with external integrations
  disabled, and export the matching registered achievement catalogue.
- [ ] Generate and validate the backup manifest, run the offline exporter, and
  import the public projection with the atomic local importer. Keep raw backups
  outside Git and `public/`.
- [ ] Rebuild the local player preview with the validated real import.

## Real-data acceptance

- [ ] Verify full player guild memberships and actual stored guild banners.
- [ ] Verify available guild quests, player contributions, standings and reward
  status against the same backup snapshot.
- [ ] Verify individual achievement completions against the registered catalogue;
  shared-team and unknown records must not become personal completion claims.
- [ ] Check profile links, mobile layout, and empty, stale and unavailable states.
- [ ] Record snapshot freshness and remaining missing data before reporting these
  feeds complete. Production and live client verification remain separate gates.

## Prepared locally

- [x] Offline backup exporter and manifest helper.
- [x] Validated atomic importer and preview integration.
- [x] Opt-in local achievement catalogue and individual completion exporters.
- [x] Local automated verification recorded in the backup guide.

Implementation and verification details: [real feeds](REAL-FEEDS.md) and
[local export instructions](LOCAL-PROFILE-EXPORTS.md).

## Backup access blocker (checked 2026-10-13 UTC)

- Read-only Bloom inventory confirms completed backup `Backup at 2026-10-12
  05:00:58`, ID `2d7a3cb7-90d9-4525-9f3c-3f0e148c6429`, completed at
  `2026-10-12T07:49:57+00:00`, reported size 2,239,715,533,125 bytes.
- A bounded download request failed certificate verification: the download host
  `ash-bm-1167.bloom.host` has an expired TLS certificate. No verification bypass
  or full download was attempted; no signed URLs or credentials are recorded here.
- LumaGuilds `temp_exports/` is empty. Its live database and WAL were changing
  during inspection and were not copied as a purported consistent backup.
- Bloom's documented selective access uses a server-mounted backup, which limits
  server controls. No mount, restore, backup creation or server change was made.
- [ ] Obtain the required subset through a working, verified download or a
  separately supplied consistent backup. Establish SQLite snapshot provenance;
  a completed host backup alone does not prove database consistency.
- Real import remains pending; the existing preview data was preserved.

## Website PR preparation, 13 October

- [x] Preserve the preferred full-skin player profile layout with real-feed data.
- [x] Add terminal market ledger checkpoints, restart/overlap regressions and
  native producer-to-public-insights contract verification.
- [x] Repair sparse history charts, unknown mover comparisons and completed-week
  selection without fabricating historical guild/stall ownership.
- [x] Refactor additional review findings with domain regression coverage.
- [ ] Complete 102 remaining local maintainability entries and obtain hosted
  analyzer results; see the saved per-finding disposition report.
- [ ] Collect consistent backups and import the remaining real guild, quest and
  achievement data. The website PR does not include or activate server plugins.

Host documentation: [Bloom backup management](https://docs.bloom.host/backups).
