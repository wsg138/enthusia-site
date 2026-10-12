# Real community feeds — local implementation

The owner requests local work only, with no new PR or publication. Canonical
website main cdcd8aa was fetched before this continuation. Preserve prepared
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
