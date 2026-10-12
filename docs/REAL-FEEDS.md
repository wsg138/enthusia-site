# Real community feeds — local implementation

The owner requests local work only, with no new PR or publication. Canonical
website main bcc9d25 was fetched and integrated before this continuation. Preserve prepared
changes and the hidden Christmas content boundary.

## Requirements

- Prefer valid signed community snapshots when present. Where snapshots are
  absent, player profiles may combine the existing public R2 playtime and balance
  boards by stable UUID. Minutes become hours explicitly; unknown values stay
  unavailable. Do not export last-seen times, IPs, internal roles or memberships.
- Each other feed may use a configured read-only upstream endpoint. Routes and
  secret names are fixed in code, not controlled by request parameters. Reject
  credentials in URLs, redirects, oversized bodies, invalid schemas and future
  timestamps. A failed upstream stays unavailable rather than using mock data.
- Preserve generated-at freshness and bounded public projections. Public sources
  are partial unless their contract explicitly guarantees complete coverage.
- Sales require stable transaction IDs and SELL records for the real raw-gold
  quantity paid; do not infer historical trades from current shop prices.
- Guild quests must come from a consistent active/recent quest-set read, preserve
  decimal Long counts and server tie ordering, and never perform claims/rewards.
- Warzone uses MaceGuard's effective override/schedule and counted WarzoneDuels
  wins. A captured file is not an automatic update feed.

## SPEAR and acceptance

Use existing manual SPEAR evidence because this website has no local EARS/state
helpers. First reproduce missing fallback/adapter behavior in meaningful tests,
then implement adapters and run regression, privacy and failure-path checks.
Plugin producers require their own source/runtime tests and merged/pinned source
before activation. This local task does not authorize server mutation or bypass
the earlier canonical-source production requirement.

Live activation remains separate: source incorporation, endpoint configuration,
secret setup, merged plugin deployment where required, remote smoke checks and
real account/Discord acceptance. No token is stored in source or fixtures.

## Current-main integration and local producer map (12 October)

Current website main bcc9d25 is merged locally at 9af4186, preserving its shared
account linking, verified Discord setup, disabled production workers, 50-record
guild directory, quests and Warzone views. Those features were not reimplemented.
No PR, remote push or deployment occurred in this continuation.

| Feed | Local source | Coverage / activation boundary |
| --- | --- | --- |
| Players | Public R2 playtime and balance boards joined by UUID | 137 captured public profiles in preview; partial leaderboard coverage, no invented guild/rank/honours or opt-out controls |
| Guild quests | LumaGuilds read-only active-set SQL/API producer | Consistent definitions/progress, Long precision; bounded standings; no archive policy guessed |
| Bounties | Optional Competition Bridge public API adapter | Unrestricted item-free cash contributions only; currency must explicitly be verified as RAW_GOLD; no setter/hunter lists |
| Achievements | Actual projection-only pilot renderer public catalogue API | Registered provider definitions; no bundled defaults, grants or private progress; rewards and completion totals remain unknown |
| Market history | EnthusiaMarket paged completed-SELL ledger API | Stable IDs, raw recorded values, no identities; historical guild/stall attribution stays empty rather than joining current ownership |
| Warzone | Opt-in MaceGuard signed publisher | Effective runtime rules/override/schedule; optional counted Duels wins API remains source/runtime gated |

Local producer repositories: `C:/Users/p_ric/Documents/Codex/site-feed-lumaguilds`,
`site-feed-market`, `site-feed-advancements`, `site-feed-maceguard`. Sources start
at their fetched canonical mains (8740521, 14351db, 2736261, 38e4255 respectively).
NotBounties remains untouched. Its adapter calls only documented public getters;
synthetic API contract tests do not prove installed 1.22.37 binary compatibility.

### Configuration contracts, not activated

- Community GET bridge: `community-feeds.enabled=false`, loopback port 8766,
  environment `ENTHUSIA_COMMUNITY_FEED_TOKEN`; bounty currency defaults UNVERIFIED.
  Restart is required after changing this optional listener's configuration.
- Market GET producer: `website-sales.yml`, disabled default, loopback port 8124,
  environment `ENTHUSIA_MARKET_SALES_TOKEN`, currency defaults UNVERIFIED.
- Protect each loopback listener through an operator-managed HTTPS proxy. The
  website worker accepts fixed configured endpoints and corresponding tokens:
  `COMMUNITY_GUILDQUESTS_API_URL/_TOKEN`, `COMMUNITY_BOUNTIES_API_URL/_TOKEN`,
  `COMMUNITY_ACHIEVEMENTS_API_URL/_TOKEN`, `COMMUNITY_SALES_API_URL/_TOKEN`.
  The actual variable pairs are `..._API_URL` and `..._API_TOKEN`.
- MaceGuard uses the existing signed ingest contract and a server-side
  `COMMUNITY_INGEST_SECRET`. Do not reuse provider or Discord credentials.
- `cloudflare/community-sync` is disabled by default; its scheduled task projects
  public fields, protects source timestamps and persists transaction cursors in
  the same batch as sales. Old/undated exports cannot replace dated snapshots.

### Proof and remaining gates

The older/undated bounty regression first failed (HTTP 200 instead of 409), then
passed after monotonic persistence and stale-response repairs. Unattributed-sale
tests verify prices/history work while guild/stall leaders remain empty. HTTP
tests cover authentication, methods, exact paths, cache/null serialization and
invalid cursors. Privacy tests exclude restricted rewards and provider internals.

Canonical WarzoneDuels still describes 1.0.1. A local historical candidate
4cae280 describes 1.0.4; a version match alone cannot identify the installed JAR
or establish team-win credit semantics. That candidate was inspected read-only;
the user's cooldown worktree was not changed. Reconcile exact runtime provenance
before weekly-wins activation. The prior current-main export remains local.

The player preview is interactive at localhost:8873/preview/real-player-check.html
and uses captured real data with stale/partial labels and blocked writes. Browser
checks cover StepSoy search, unknown names, actual UUID heads and 390px overflow.
This local-only delivery has no mobile-accessible hosted link.

### Verification checkpoint

- Website: 536 tests pass; lint/reference/map checks, static build and Pages
  Functions compilation pass. Map coverage: 15 buildings, 71 stalls, 94 shops.
- Community bridge: 19 tests and Maven verify pass on both Java 21/Paper 1.21.8
  and Java 25/Paper 26.2 profiles.
- Market: 776 tests discovered, 769 pass, seven skipped; test/shadowJar pass with
  exact CI Nexus 057836b through supported Maven Local. Skips cover MariaDB and
  remote authentication. The initial mixed-JUnit NoSuchMethodError was repaired
  with a matching enforced BOM and explicit launcher; no tests were disabled.
- LumaGuilds: 1682 tests discovered, 1666 pass, 16 skipped. Skips cover external
  MariaDB, schema rehearsal and runtime-provider acceptance. Quest consistency,
  Long/privacy and HTTP/null-serialization regressions pass.
- Actual advancement pilot: Maven verify and 42 tests pass, no skips.
- MaceGuard: prior unchanged local publisher passed 538 tests/Maven verify;
  refetched canonical main remains 38e4255.
- Community sync dry run compiles, disabled: 21.83 KiB / 6.52 KiB gzip. No remote
  Worker deployment occurred.
- Saved PR52 triage: 176 maintainability entries remain open, 62 meet local AST
  thresholds, 13 changes await hosted analysis, 40 verified-context entries and
  26 analyzer mismatches. Refactors cover market deep links, community details
  and appeal cards. This does not establish fresh hosted analyzer acceptance.

Remaining: resolve counted-duel runtime provenance/team semantics; verify actual
provider compatibility/currencies; address open maintainability entries; land
canonical source/pins. Later, with publication authorization, activate producers
and verify real feeds, network linking and Discord delivery. Player coverage is
partial; provider rewards and individual achievement completion need their own
public contracts. Local test JARs are unmerged and must not be installed as
production artifacts.
