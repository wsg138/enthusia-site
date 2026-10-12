# Community features: integration and bring-up

The public pages use production controllers and `/api/community/*`. They do not load mock scripts. Preview pages reuse those controllers and intercept API calls with labeled sample data; all preview writes return 501. Public preview interactions cannot publish news, vote, ingest sales or send DMs.

## Resources (not provisioned or applied)

Configure a separate `COMMUNITY_DB` D1 binding on Pages and apply `migrations/community/0001_community.sql` through the normal reviewed migration process. Existing `COMPETITIONS_DB`, Discord OAuth/linking and staff-role configuration remain required for linked ballots and staff publishing. `COMMUNITY_EDITOR_ROLES` defaults to `founder,admin`. It is independent of appeal reviewer roles.

The publishing editor is `newseditor.html`. It supports news, changelog, roadmap, timeline, Hall of Fame, creators, museum exhibits, curated achievements and polls. Drafts and archived records are omitted from public lists. Revision conflicts require reload; changes are audited. Poll options cannot change after the first ballot. Server UTC deadlines control ballots; closed polls expose totals. No news comment API exists.

Historical design entries are preserved in `assets/design-drafts.json`. The editor offers an explicit import into private drafts; it skips existing slugs. All 79 imported entries are unverified because the separate fact-check document was not supplied. Verify dates and sources before publishing. Chapter 2 launch is 2 October 2026. Mapart Museum credit is 0uzen. Timeline scope is Enthusia SMP only.

## Public server export contract

POST `/api/community/ingest`, JSON `{ "kind": "guilds|players|bounties|achievements|warzone|sales", "items": [...] }`.

Only the server producer uses `COMMUNITY_INGEST_SECRET` (at least 32 characters). Headers:

- `x-enthusia-timestamp`: Unix milliseconds; within five minutes.
- `x-enthusia-nonce`: unique 16–80 ASCII alphanumeric/underscore/hyphen characters.
- `x-enthusia-signature`: lowercase hex HMAC-SHA256 of `timestamp + "\n" + nonce + "\n" + request pathname + "\n" + exact UTF-8 request body`.

The explicit operator utility `node scripts/publish-community-export.mjs export.json https://your-reviewed-site` validates/projects JSON and signs a publish request using the COMMUNITY_INGEST_SECRET environment variable. It is never invoked by tests, builds or this implementation session.

Nonces are persisted and rejected on replay. A snapshot update and nonce insertion share one D1 transaction. Requests are bounded to 150 KB, snapshots to 1,000 records and sales batches to 250 events. Unknown public fields are discarded; private home coordinates, IPs, email, internal memberships and identities are never copied to public output.

Every snapshot item has `id`, `name`, optional public `description`. Additional fields:

| Kind | Public fields |
| --- | --- |
| guilds | level, members (count), elo, recruiting, peaceful, membersList (public names only), banner (`baseColor`, `patterns` with `type`/`color`), links (`label`, HTTPS `url`) |
| players | guild, rank, playtime (hours), balance (raw gold), reputation, achievements (public labels), links |
| bounties | gold (raw gold), state (`open`, `claimed`, `expired`), hunter (public name), expiresAt |
| achievements | category, reward (description), completed (count) |
| warzone | type (`kit`, `leader`, `activity`), kills (public weekly count), endsAt (rotation timestamp), target (public HTTPS link) |
| sales | id (stable transaction ID), stall (canonical map stall ID), guild (public guild name or empty), item (canonical material key), quantity, gold (raw gold actually paid), occurredAt (ISO timestamp) |

Full snapshots replace the previous collection, including an empty collection. Missing fields stay unknown; missing recruitment/peaceful fields do not classify guilds. After 15 minutes the UI identifies stale exports. Sales IDs are idempotent; changing a stored ID's content is rejected. Only completed positive raw-gold transactions belong in the ledger. Do not export barter as gold or infer sales from stock movement. Corrections/reversals require a reviewed ledger correction process; this endpoint does not support refunds.

## Canonical source inspection

Both requested GitHub accounts were inventoried. Relevant source heads inspected on 11 October 2026:

- `wsg138/LumaGuilds` daedf8cbdc2374ad34a7a5dc5938351cbffde548: WebApiServer, GuildLeaderboardHandler, LeaderboardDtos and leaderboard API documentation. The existing site proxy is reused as a **limited fallback** for guild names, levels and member counts; it is not a full directory, recruitment feed or war/ELO history. The documented activity period is advisory and currently weekly.
- `wsg138/EnthusiaMarket` 4fd250af1103931973330b8615366d9d3b044b88: PostShopTransactionEvent consumer, ShopTransactionRepository and website sync files. Completed sale events/ledger exist; the stock snapshot does not export this sales ledger. A producer must map stable transaction IDs, canonical stall IDs, material quantities and raw-gold amounts into the ingest contract.
- `BadgersMC/EnthusiaAdvancements` 2736261976480891fcf298ad4305e7dc44910eca: configurable progression trees and completion event. No website export was located in the inspected contract. A producer must export public achievement definitions/progress under the schema above.
- `BadgersMC/enthusia-network` 559bfabc2187ab796a3be889f032383a8041f819: monorepo pins still identify the BadgersMC guild/market/advancement repositories. A future companion export change must reconcile those canonical pins before deployment. This PR does not update plugin repos or the monorepo.

No public bounty producer endpoint or complete player profile feed was supplied or located in the inspected website contracts. The signed snapshot boundary is implemented; connecting authoritative producers remains necessary. Do not read production plugin databases directly or enable new server exports implicitly.

## Market and alerts

`GET /api/community/insights?week=YYYY-MM-DD&mode=stall|guild&item=material` derives UTC Monday weeks, weekly leaders, top-five streaks, a weekly hall of fame, 30-day weighted prices, previous-period changes, traded quantities and daily chart points from the ledger. Trade prices compare raw-gold SELL shops only; barter and BUY shops receive no price verdict. Optional Prices/Weekly gold map layers appear only when ledger sales exist. The share image is rendered locally at 1200×630.

`GET/POST /api/community/alerts` manages the signed-in linked Discord account's subscriptions (maximum 20); POST with `remove:true` opts out. Thresholds are raw gold per item. The separate worker in `cloudflare/market-alerts/` must bind the same COMMUNITY_DB and receive the existing Enthusia bot's `DISCORD_BOT_TOKEN`. `MARKET_ALERTS_ENABLED` defaults off. No bot token was read, worker deployed or message sent. Delivery uses opted-in subscriptions, a 24-hour weighted price, hourly attempt cooldown, database claim and recheck before messaging. 429 responses stop the run; other failures retry later. A crash after Discord delivery but before the database update can cause a later duplicate: delivery is not exactly-once. Verify DMs/opt-out against the real bot before activation.

## Store and seasonal designs

The Store page links to current Tebex checkout and does not invent prices or payment processing. `/events`, `/start koth` and Glorious holders are retained; chat tags are not offered. A custom hosted Tebex theme is a separate platform deliverable; no Tebex-compatible theme package was exported or installed.

`home-christmas.html` is an explicitly labeled, noindex seasonal reference. Sculk assets load only with `?skin=sculk`; default Home remains unchanged. Real service, OAuth, guild data, D1 migrations, production deployment and mobile/client acceptance are separate from local preview proof.

The home Warzone tile consumes the signed `warzone` snapshot. Export the current kit and next rotation, weekly public kill leaders and public activity descriptions. Missing fields stay unavailable; the website does not derive combat statistics from online players or invent rotation schedules. A server producer is still required.
