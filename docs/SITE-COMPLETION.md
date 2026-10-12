# Website completion checkpoint

## Requirements and delivery boundaries

The requested work covers real community feeds, guild quests, market history,
Discord sign-in and delivery, prepared visual repairs, and review findings.
Payments stop at checkout readiness. No new pull request is authorized.
Keep the unreleased Christmas skin absent from published assets and links.
Do not invent missing records or substitute sample fixtures for live feeds.

This integration starts from the prepared Warzone branch at 0c251f4 and combines
the separately tested skin, banner, guild-directory, request-hardening, market
theme and guild-quest changes. Canonical website main was checked at cdcd8aa.
PR 52 is already merged; this checkpoint is subsequent source work.

No project-local EARS validator or SPEAR state helper is present. Requirements,
proof, implementation, integration and acceptance are recorded manually here.
Documentation and read-only infrastructure inspection need no behavioral engine
test. Source changes use the existing regression suite.

## Proof and implementation

- Initial combined checks found Christmas links in newly introduced quest and
  verification pages. Removed those links without removing historical photos.
- Regenerated combined previews from the actual merged HTML. This also removes
  a redundant nonfunctional Load more button from the punishment preview and
  aligns the creator controller version with the public source.
- Preserved the request-hardening route decomposition when incorporating the
  guild-quest endpoint. Preserved older-snapshot rejection and source timestamp
  freshness for guild quests.
- Updated the saved-review triage tool to inspect the two explicitly archived
  Christmas JavaScript sources. Missing arbitrary source files still fail the
  audit. Archived findings are not silently marked resolved.
- A focused regression reproduced the combined guild-quest route being rejected
  by the older browser allowlist. Added the exact `guildquests` route while keeping
  traversal and unsupported routes rejected.
- All 512 tests pass; lint and site-reference checks pass. Map verification covers
  15 buildings, 71 stalls and 94 shops. Static build and Wrangler 4.149.0 Functions
  compilation pass.
- Saved report still has 182 open maintainability findings. Local thresholds and
  analyzer incompatibilities are separate from hosted analyzer acceptance.

## Live checks on 12 October 2026

- Production Pages deployment remains 3a7de9ca, source e91584b; prepared integration
  is not deployed. Christmas removal and the council hall replacement are live.
- Guilds: 10 real records, explicitly limited. Players, bounties and Warzone have
  no available community feed. Curated achievements return zero records.
- Market insights return zero sales and no history. They cannot support real
  price trends until the owning producer supplies transactions.
- Account page renders the sign-in link. Direct OAuth start currently returns
  HTTP 503 `discord_oauth_unavailable`. An unsigned session HTTP 200 is not proof
  of successful sign-in. Browser navigation to the OAuth route is additionally
  blocked by the browser client, so no code exchange or staff session is verified.
- Production has the OAuth variable names and an encrypted client-secret name.
  The expected OAuth-state table/columns exist and migration listing reports no
  pending migrations. This does not establish that the stored secret is valid.
- Dedicated website bot token is absent in production. Credential entry remains
  with the owner. No test message or notification worker activation has occurred.

## Producer source gates

The actual rotation owner is MaceGuard. The earlier standalone WarzoneRotator
export candidate must not be installed on this server. Current MaceGuard main is
38e4255cf1940c2397da5a4e2cecc6c56498c8b4.

Production runs WarzoneDuels 1.0.4, but authoritative standalone main at
480a365188b38b130ae384ea8495293f7428d77f and network pin
475d245fb9b415332be6b0010216523a85475da7 describe 1.0.1. Resolve this lineage before
building an exporter or updating the runtime; do not downgrade production.
Network main inspected: 559bfabc2187ab796a3be889f032383a8041f819.
LumaGuilds main inspected: 8740521949d2c1787511e50b265c1459475b3d41.

The quest website contract is implemented, but an authoritative consistent
QuestService snapshot producer remains required. Player, bounty, achievement
and sale feeds also require their owning public export paths. A captured preview
is distinct from an automatic live feed.

## Remaining acceptance

- Reconcile actual plugin source/runtime lineage, implement and verify owning
  exporters, land canonical source and network pins before production artifacts.
- Add the dedicated bot secret; verify OAuth credentials and exact callback;
  complete real sign-in, linking, staff permissions, logout and delivery to the
  authorized test recipient FainNeito. Inspect outboxes before enabling sends.
- Review the imported unverified content against sources; unfinished roadmap
  text and undecided winners remain labeled rather than fabricated.
- Address remaining maintainability findings with focused decomposition and
  regression tests, then obtain fresh hosted analysis for the delivered head.
- Incorporate prepared website source into canonical main without creating a
  new PR, respecting maintainer permissions; publish and verify the exact result.

Nothing in this checkpoint claims deployment, real Discord receipt, payment,
plugin activation or completed editorial verification.
