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

### Local source checkpoints

- Website code: b3cdf38 on feature/site-completion, includes current main bcc9d25.
- LumaGuilds producer: 2c10bc2 on local/website-guild-quest-export.
- Market producer: 101827f on local/website-sales-feed.
- Advancement pilot: c8c3128 on local/website-achievement-catalog.
- MaceGuard publisher: 831be72 on local/website-warzone-export.

The achievement contract preview is generated from actual page markup by
scripts/build-achievement-contract-preview.mjs. Its local connected/empty/stale/
unavailable controls and category selection were checked in the browser;
390px viewport, 375px document width, no horizontal overflow. Counts show actual
fixture definitions/categories; no unsupported reward/daily commands or personal
progress claims. The simulation is labeled and writes are blocked. This does
not prove that the installed renderer exports a live catalogue.

## Expanded profiles, local continuation

Requirements: show authoritative UUID-based guild associations (multiple guilds
supported), levels/banners and links. Never infer membership from delegated stall
access or names. Distinguish a successful no-guild lookup from unavailable data.
Add the positions actually published by the balance/playtime boards, not guessed
global ranks. Public market cards match player ownership by UUID, exclude guild
and delegated stalls, and show shop counts/types with stale-source disclosure.
No online/last-seen data, roles/permissions, guild rosters, homes or private
achievement progress is exported. Continue manual SPEAR; no local EARS helpers.

LumaGuilds GET /api/community/player-guilds accepts 1-50 canonical UUIDs in the
players query, requires a nonblank configured bearer, and exports only requested
player-to-guild associations. Website settings COMMUNITY_PLAYER_GUILDS_API_URL
and COMMUNITY_PLAYER_GUILDS_API_TOKEN configure a protected HTTPS endpoint.
The token matches the existing LumaGuilds Web API bearer and stays server-side.
The site batches public profile UUIDs; a failed lookup preserves base stats.
This endpoint is prepared locally, not installed or activated on the server.

The real profile preview uses captured public boards and a minimized captured
market projection (IDs, ownership, shop directions and source dates only).
A separate Guild layout example is explicitly simulated and never assigns an
invented guild to StepSoy or another real player. Actual guilds remain unknown
until the new exporter is available. Rebuild with scripts/build-real-player-preview.mjs
and both private capture paths. All preview writes remain disabled.

Verification: 541 website tests pass; lint, site checks, map validation, static
build and Pages Functions compilation pass. Regression tests cover UUID joins,
known-empty versus unavailable guilds, ownership exclusion, and independent
source freshness. A newer guild capture can update an unchanged board without
making old balance/playtime data appear fresh. Only the displayed 1000 public
profiles are queried, in batches of 50.

Browser proof: actual captured CheddarManPro profile shows published positions
and one owned stall with 13 shops. The separately labeled simulated profile
shows the banner/name/level guild layout. At a 390px viewport, document width
is 375px without horizontal overflow. Known guild fragments select the matching
profile; missing guild fragments show an unavailable notice, preserve the
requested fragment and do not substitute an unrelated guild. Same-page guild
fragment changes were checked. Screenshots are retained outside the repository.
The localhost preview is computer-only; no mobile-accessible hosted link was
published under the local-only instruction. No PR, push or deployment occurred.

Profile picker refinement: keep heads and names vertically centered with at
least 16px between them. Use consistent responsive card columns, allow long
names to wrap and preserve the existing selected-state bevel. Visual browser
proof replaces unnecessary unit tests for this reversible spacing-only change.
Verified all 12 rendered cards have a 16px head/name gap and centered alignment.
Desktop uses equal-width columns; 390px mobile uses one column with no horizontal
overflow (375px document width). Selecting SleepingOnCheese updates the profile
and selected state. JavaScript syntax check, diff check and static build pass.
Local only; no PR, push, deployment or hosted mobile preview.

## Real guilds in the local player preview

Read-only capture of the live public guild leaderboard provides topMemberUuids,
not a complete roster. UUID-positive joins confirm 23 of 137 captured profiles.
The live market publishes banner designs for Vibe, WeOnTop and Asgard; only
stable guild UUID joins supply these designs. Nonmatching players remain unknown,
never no-guild; matches have guildsPartial:true and explicit incomplete-coverage
text. Complete authenticated memberships remain authoritative over this partial
fallback. Missing banners are labeled, never invented. No market access-member
lists are used as guild membership evidence.

The local builder's fourth argument is the privately captured guild board.
It projects only public guild metadata and profiles and generates a real guild
directory for profile links; credentials and raw server data stay outside the
repo. The native authenticated exporter remains the route to complete coverage,
and is not activated here. Live server inventory was read-only; the active
SQLite database was not copied or queried while the server was running.

Verification: 544 website tests and the normal static build pass. Focused tests
prove UUID-positive joins, duplicate suppression, absence remains unknown,
market access exclusion, banner identity and complete-lookup precedence.
Browser proof shows CheddarManPro / WeOnTop / level 100 and its published banner;
the real guild link selects WeOnTop in the captured directory. A 390px viewport
has 375px document width and no horizontal overflow. Screenshot retained in
the private evidence directory. Localhost only; no mobile-hosted link, PR,
push, installation or deployment. Complete rosters and seven unpublished
banner designs remain unavailable in the currently exposed public feeds.

## Profile activity connections: local continuation

Requirements: complete guild DTO imports replace partial memberships by UUID;
never invent a banner. Guild quests are guild progress, not personal credit;
select the active exported week, preserve Long counts and existing standings.
Achievement definitions or aggregate completion counts do not prove personal
completion. Explicit public player completion names/known-empty state are
supported. Bounty targets join by UUID, omit closed/expired records, and never
expose setters, whitelists or item metadata. Monetary units remain unknown
unless the public adapter has verified raw gold. Weekly totals must use all
counted matches, not infer zero from an absent top-three entry. All async sections
must ignore results after profile selection changes and show unavailable/stale
states. Continue manual SPEAR; no project-local EARS/state tooling exists.

Local capture bundle (builder fifth argument): optional playerGuilds source
contains generatedAt and requested id/guildMemberships rows; optional players
contains generatedAt and publicly exportable achievement names with
achievementsKnown, or weeklyDuelWins {weekStartsAt,capturedAt,wins}. Other optional
guildquests/bounties/warzone entries use the existing bounded public contracts.
Importing does not write to the website, server or Cloudflare. Complete data
also refreshes local guild cards and preserves already available directory data.

Read-only investigation: LumaGuilds temp_exports is empty. Its 1.4GB active
SQLite database contents route returns 403; the signed download endpoint's TLS
certificate is expired. No protection was bypassed and no active SQLite copy
was used. Complete memberships, unconfirmed guild banners and actual guild quest
standings still require a consistent public export. The live achievement route
returns an empty catalogue with no personal completions; catalogue data is not
treated as an empty personal achievement list.

Fresh read-only bounty and H2 duel captures were byte-identical across two GETs.
Only unrestricted public bounty target identity/state is projected; payout is
null because currency/item eligibility is unverified. All 137 profiles receive
complete counted weekly win totals from the captured H2 source using the native
query filters: counted_as_match, non-DRAW, nonempty winner and UTC Monday interval.
The SQLite source is separate and remains unavailable. H2 is opened locally in
ACCESS_MODE_DATA=r with IFEXISTS; no production SQL or mutations run. These are
captured results, not automatic live feeds. Raw captures, credentials, and
raw database files remain outside the website repository. The reviewable
read-only helper is scripts/export-captured-profile-wins.java (JDK 21 source
launcher with the existing H2 2.2.224 and Gson libraries on the classpath).
Arguments: captured H2 base filename without .mv.db, capture timestamp file,
public profiles JSON, private output JSON. It never accesses the server or
authenticates; the operator supplies an independently verified consistent copy.

Verification: 549 website tests, lint, page checks, map checks, static build and
Pages Functions compilation pass. The repository helper reproduces all 137
captured weekly totals without changing the H2 input hash; the source has one
weekly winner, Solan231 with one counted win. Other public profiles have verified
zero in this capture. The fresh bounty source has 41 unrestricted targets and
expiry is disabled (bounty-expire.time=-1), confirmed read-only. Unknown payouts
remain null, and bounty summary totals render unavailable instead of zero.

Browser checks cover real WeOnTop banner/profile, known-zero weekly results,
averality's matching public bounty, and the separately labeled simulated quest
42/100 progress, achievement and bounty states. Two observed UI failures (wrong
feed route syntax and an immediate result before the cloned profile attached)
were repaired and rechecked. Six profile cards use one column at 390px; document
width 375px, no horizontal overflow. Captured-page links point to corresponding
local capture views; unavailable feeds never fall through to sample page data.
The local builder fingerprints the directory entry script to avoid a stale
browser module obscuring the nullable-payout fix. Screenshot evidence remains
outside source. No PR, push, remote writes, installation or deployment occurred.
The interactive link is localhost only, not a hosted mobile-accessible link.
