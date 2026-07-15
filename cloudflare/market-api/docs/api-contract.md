# Enthusia Market API contract

Version 1 exposes public market state without map geometry or plugin-private data. JSON objects are strict: fields not listed here are rejected on private writes.

## Signed private requests

`POST /internal/v1/test`, `POST /internal/v1/full-sync`, and `PUT /internal/v1/stalls/:stallId` require `X-Enthusia-Server-Id`, `X-Enthusia-Timestamp`, `X-Enthusia-Event-Id`, and `X-Enthusia-Signature`.

The timestamp is Unix epoch milliseconds within five minutes. The event ID is 1–128 visible ASCII characters and must match the JSON `eventId`. The signature is `v1=` followed by a lowercase HMAC-SHA256 hexadecimal digest. Its canonical input contains no trailing newline:

```text
v1
<METHOD>
<PATHNAME>
<SERVER_ID>
<TIMESTAMP>
<EVENT_ID>
<SHA256_HEX_OF_EXACT_RAW_BODY_BYTES>
```

The body envelope is `schemaVersion: 1`, `serverId: "enthusia-main"`, a persistent `serverEpoch` string, an `eventId`, and ISO-8601 `sentAt`. Full sync adds a positive `snapshotRevision`, ISO-8601 `generatedAt`, and exactly 71 `{ revision, stall }` entries. A stall update adds a positive `revision` and one `stall`. The test route adds a bounded `probe` string and never changes state.

## Public stall

Each stall contains only:

- `id`: one canonical `stall1` through `stall71` ID.
- `buildingId`, integer `floor`, and `location` (`world`, integer `x`, `y`, `z`).
- `owner`: `type` (`NONE`, `PLAYER`, or `GUILD`), nullable public `id`, nullable Java UUID text in canonical `8-4-4-4-12` hexadecimal form, public `name`, nullable allowlisted Minotar `helm` URL, and `avatar` with `kind` plus optional public `source`, `includesOuterLayer`, `url`, and banner design. Proxy-assigned Minecraft UUIDs are not required to carry RFC version or variant bits.
- Java player and guild-leader head URLs use `https://minotar.net/helm/<uuid>/96.png`; the `helm` endpoint includes the skin outer layer. Floodgate/proxy identities do not query Java skin services by name and retain a source marker so clients use the generic Bedrock fallback until supported skin bytes are cached.
- A guild banner design contains one of Minecraft's 16 banner colors as `baseColor` and zero to six ordered `{type, color}` pattern layers. Pattern names are the bounded public Minecraft/Paper names accepted by the schema. No Bukkit item, persistence record, submitter, or internal banner ID is public.
- Authoritative `stallState`; nullable ISO-8601 `ownerSince`, effective `nextRentAt`, and GRACE-only `graceEndsAt`; plus bounded `rentTimingStatus`. A legacy owned row may derive `nextRentAt` from `ownerSince` and the configured collection interval.
- `members`: up to 256 public names.
- `shops`: up to 256 shops.

A shop contains a positive numeric `id`, public owner `id` and `name`, direction (`BUY`, `SELL`, or `TRADE`), `sellItem`, positive `sellAmount`, `costItem`, positive `costAmount`, interaction coordinates and source, nonnegative `stockCount` and `availableTrades`, and boolean `searchable`. Item `amount` describes the serialized stack; `sellAmount` and `costAmount` describe one transaction and may exceed Minecraft stack limits.

An item contains uppercase `material`, public `displayName`, positive `amount`, nullable public `icon`, and strict `metadata`. Metadata may include nullable `customName`, `enchantments`, `storedEnchantments`, potion data, armor trim, smithing-template type, written-book summary, shulker color, and a bounded recursive container. Container entries contain an optional nullable numeric slot and another public item. Text, array, coordinate, count, and nesting payload size are bounded by schema and route limits.

Sanitized example:

```json
{
  "id": "stall35",
  "buildingId": "building-7",
  "floor": 1,
  "location": { "world": "world", "x": 10, "y": 64, "z": -20 },
  "owner": {
    "type": "PLAYER",
    "id": "public-owner-35",
    "uuid": "00000000-0000-4000-8000-000000000035",
    "name": "P2wn",
    "avatarUrl": null,
    "avatar": { "kind": "MINECRAFT_HEAD", "source": "JAVA", "includesOuterLayer": true }
  },
  "stallState": "OWNED",
  "ownerSince": "2026-07-01T12:00:00Z",
  "nextRentAt": "2026-07-15T12:00:00Z",
  "graceEndsAt": null,
  "rentTimingStatus": "PERSISTED",
  "members": [],
  "shops": []
}
```

Database row identifiers, permissions, economy internals, staff notes, secrets, authentication data, paths, raw serialized objects, commands, configuration, buildings, polygons, bounds, and foreground/layout assets are not accepted.

## Public HTTP and live events

- `GET /health` reports binding readiness and initialization state.
- `GET /v1/market` returns the active 71-stall generation in natural stall order, or 503 before initialization.
- `GET /v1/stalls/:stallId` returns one stall and supports `ETag`/`If-None-Match`.
- `GET /v1/live?since=<sequence>` upgrades to a hibernating WebSocket for either allowed website Origin.

The socket first sends `hello`. Replayable state events are `stall.updated` and `market.replaced`. When `since` predates retained history, the server sends `resync_required` with reason `history_unavailable`. State is committed before an event is broadcast. The newest 1,000 state-change events are retained.

Public CORS allows only `https://enthusia.info` and `https://enthusia-community.racecarboy77.chatgpt.site`; non-browser requests without `Origin` remain valid. Internal endpoints never return CORS permission.
