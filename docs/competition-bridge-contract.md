# Enthusia Competition Server Bridge

The competition site never reads Minecraft plugin databases directly. It calls a small authenticated bridge hosted beside the Minecraft server. The bridge may listen only on loopback/private networking and should be exposed to Cloudflare through HTTPS (for example a Cloudflare Tunnel).

## Request authentication

Every website request is a `POST` with JSON and includes:

- `Authorization: Bearer <shared bearer token>`
- `X-Enthusia-Timestamp`: Unix epoch milliseconds
- `X-Enthusia-Nonce`: one-use UUID
- `X-Enthusia-Content-SHA256`: base64url SHA-256 of the exact request body bytes
- `X-Enthusia-Signature`: base64url HMAC-SHA256 of:

```text
POST\n
<request path>\n
<timestamp>\n
<nonce>\n
<content hash>
```

The bridge must reject stale timestamps, replayed nonces, wrong bearer tokens, body-hash mismatches, and signature mismatches. Secrets must be at least 32 characters and must not be logged.

## Endpoints

### `POST /v1/competitions/player-context`

Request:

```json
{
  "accountSubject": "authenticated website subject",
  "playerUuid": "canonical UUID"
}
```

Response:

```json
{
  "activeMinutes": 1234,
  "linkedMinecraftAccounts": [
    { "uuid": "...", "name": "Player" }
  ],
  "guilds": [
    {
      "id": "guild UUID",
      "name": "Guild name",
      "permissions": ["competition.submit"]
    }
  ],
  "fetchedAt": "2026-08-23T00:00:00Z"
}
```

`activeMinutes` is lifetime **active** time from EnthusiaPlaytime, not total time. A guild receives `competition.submit` only when the player's LumaGuilds rank has the dedicated competition-entry permission.

The bridge must never trust `accountSubject` as authorization for a different Minecraft UUID by itself. Until the shared Discord/account-link authority is available, the safe fallback is to return only the authenticated session player's Minecraft account; widening this list requires an authoritative account-link lookup.

### `POST /v1/competitions/player-lookup`

Request: `{ "minecraftName": "Player" }`

Returns the canonical known Minecraft UUID/name, or `404` if the server has no known player by that name. Do not perform arbitrary unauthenticated Mojang lookups from the request path.

### `POST /v1/competitions/guild-members`

Request: `{ "guildId": "guild UUID" }`

Returns `{ "members": ["uuid", "uuid"] }`, using LumaGuilds' authoritative membership service. Used only for rewards explicitly configured for all/random guild members.

### `POST /v1/competitions/rewards/deliver`

Request includes:

```json
{
  "schemaVersion": 1,
  "competitionId": "...",
  "submissionId": "...",
  "rewardId": "...",
  "operationKey": "competition-reward:...",
  "recipientUuid": "...",
  "rewardType": "MONEY",
  "payload": {}
}
```

`operationKey` is the durable idempotency key. The bridge must persist successful keys before acknowledging success and return an already-delivered success response on retries. Never execute a second grant for the same operation key.

Supported site reward types are `MONEY`, `ITEM`, `PERMISSION`, `RANK`, `LORE_ITEM`, `COMMAND`, and `MANUAL`. `MANUAL` is completed by staff in the website ledger and is not sent through this endpoint.

### `POST /v1/competitions/notifications/submission`

Queues/sends a new-submission staff notification. The website may include a private review URL. The bridge must send it only to staff with the configured competition-review permission.

### `POST /v1/competitions/notifications/contributor`

Queues a contributor invitation/reminder. If the player is online, show it immediately. If offline or still pending, retain a reminder that can be displayed at login until the website records accept/decline. Discord DM delivery can be added when the shared Discord account-link/bot system is authoritative.

## Minecraft integrations

- **EnthusiaPlaytime:** load the registered `PlaytimeService` from Bukkit `ServicesManager`; use `getLifetime(uuid).activeMinutes()`.
- **LumaGuilds:** load its registered `GuildLookup`; use guild membership and the dedicated competition-entry rank permission. Do not query its SQL tables directly.
- **Vault/economy:** use Vault for money rewards.
- **EnthusiaLoreItems:** use its stable idempotent service API when that API is available. Do not bypass it with direct SQLite writes.
- **Ranks/permissions:** bridge implementation is configurable. Prefer an installed permission provider/API; optional Tebex package delivery can be mapped by configured award key. The website keeps its own delivery ledger regardless.

## Threading

The HTTP listener runs off the Minecraft main thread. Any Bukkit/plugin operation that is not explicitly thread-safe must be marshalled through the scheduler and bounded by a timeout. The HTTP thread must never block the server main thread waiting on external network I/O.

## Reload/shutdown

The bridge plugin requires `/competitionbridge reload`. Reload replaces validated configuration without replacing already-persisted idempotency or notification data. Disable closes the HTTP listener, rejects new work, drains/finishes owned database work, and unregisters services/listeners cleanly.
