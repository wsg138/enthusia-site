# Guild quests — manual SPEAR record

## Spec and acceptance

Add a Guild quests destination in Community navigation and a prominent entry on Guilds. Preserve the site's exported Minecraft typography, cream/crimson/gold palette, square bevels and bundled item textures. Show weekly objectives, conditions, XP/item rewards, the full-set bonus, reset countdown, per-quest standings, selected guild progress and exported archives. Search and tier filters must work on mobile and with keyboard controls.

The Minecraft server remains authoritative for progress, completion, delivery and payouts. Counts may exceed targets and Kotlin Long values must retain precision. Missing public standings do not imply zero progress. No website reward claim or server write is introduced. Do not publish claim actors, membership rosters, private locations or arbitrary producer fields. Missing, stale, ended and empty data must be distinguishable from active live scores.

User instruction: no PR. Local branch `local/guild-quests` starts from canonical main `1a46c62` (merged PR #52). Development previews are isolated test artifacts; this feature is not a production deployment. Project-local EARS/state helpers are absent; this document is the manual requirements/task/evidence record.

## Prove and engine

Inspected canonical BadgersMC/LumaGuilds main `bfa6931ed2b0beb78ef37b8c730c3c5146f18958`: QuestDefinition, GuildQuestProgress, QuestService, QuestAction, QuestDisplayFormatter, QuestRepositorySQLite and WebApiServer. The plugin currently exposes health and guild leaderboards, but no HTTP quest feed. Its repository orders scores DESC then guild UUID ASC; progress continues beyond targets; rewards are automatically processed on the server. No historical failing test run is claimed.

Implemented `guildquests.html`, `guild-quests.js`, styles and a shared bounded public snapshot projection. Extended the existing signed community ingestion and read route; no new database migration is required. Source-generated timestamps drive freshness; older signed exports cannot replace a newer quest snapshot. Decimal strings preserve all nonnegative signed Long counts. The interactive design preview deliberately uses illustrative data and is labeled as such.

## Architecture and public producer contract

`GET /api/community/guildquests` reads the projected snapshot from COMMUNITY_DB. Absent data/binding returns 503. A trusted producer must send `kind: "guildquests"` through the existing HMAC-signed `/api/community/ingest` route using `scripts/publish-community-export.mjs`. Keep its ingest secret on the operator/producer only. This change does not configure a secret, start a producer, read plugin databases or alter live server plugins.

Envelope: schemaVersion 1; generatedAt (actual export time); currentWeekId (id or null); items (up to eight weeks). A week has id, startsAt, endsAt, fullSetBonusExperience, guilds (up to 200 public id/name/banner objects) and quests (up to 30). Quest fields: id, display name/description from QuestDisplayFormatter, action enum, tier enum, bundled icon material key, targetCount as decimal string, experienceReward, public rendered conditions, provenance policy, itemRewards `{item,name,amount}`, leaderboard flag, effective payouts `{rank,experience}` and standings `{guildId,rank,count,claimed,rewardDelivered}`. Rank is one-based server order; at most 200 rows per quest and 2,000 per envelope. Overall request limit stays 150KB. Banner format matches existing public guild exports: baseColor plus `{type,color}` patterns.

Build the export from a consistent server QuestService/repository snapshot. Use effective payouts, including configured fallback winner XP, rather than treating an empty raw payout map as no reward. Include available archive definitions and scores only; never invent deleted historic progress. The producer must map guild IDs to approved public names/banners and provide an appropriate item icon for non-item objectives. Do not substitute generated defaults for the active rotation. Example design data lives in `scripts/guild-quests-preview-data.mjs`; it is not an operator export of real quests.

## Refine and evidence

Tests cover signed ingestion, missing feed, privacy projection, replay handling, stale-source indication, older-export rejection, malformed definitions, duplicate IDs, rank order, reward states, empty rotations and Long precision. Browser checks cover guild/tier selection, featured standings, over-target scores, Nether search, no-match search, archived weeks, refresh and the unavailable feed. At 390px the page uses one column, touch-sized controls and has no horizontal overflow; item textures and banners load successfully. Lint, site/link checks, complete tests and static build results are recorded in the accompanying local evidence logs.

Remaining live integration: LumaGuilds needs an approved public quest producer/API before real weekly objectives and standings can populate. Website implementation and design proof do not establish a live feed or real-player acceptance.
