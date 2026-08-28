import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { consumeMinecraftLinkCode } from "../functions/lib/competitions/identity.js";

const DISCORD_ID = "1".repeat(18);
const PLAYER_UUID = "00000000-0000-4000-8000-0000000000a1";
const NOW = new Date("2026-08-28T12:00:00.000Z");
const EXPIRES_AT = "2026-08-28T12:05:00.000Z";
const CODE_HASH = "test-link-code-hash";

function d1(database, beforeBatch = null) {
  function prepared(sql) {
    let params = [];
    return {
      bind(...values) {
        params = values;
        return this;
      },
      async first() {
        return database.prepare(sql).get(...params) ?? null;
      },
      _params() {
        return params;
      },
      _sql: sql
    };
  }

  return {
    prepare: prepared,
    async batch(statements) {
      if (beforeBatch) beforeBatch(database);
      database.exec("BEGIN");
      try {
        const results = statements.map((statement) => {
          const result = database.prepare(statement._sql).run(...statement._params());
          return { meta: { changes: Number(result.changes ?? 0) } };
        });
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of files) database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  database.prepare(`
    INSERT INTO competition_discord_accounts (
      discord_user_id, username, created_at, updated_at
    ) VALUES (?, 'P2wn', ?, ?)
  `).run(DISCORD_ID, NOW.toISOString(), NOW.toISOString());
  database.prepare(`
    INSERT INTO competition_link_codes (
      code_hash, discord_user_id, created_at, expires_at, consumed_at
    ) VALUES (?, ?, ?, ?, NULL)
  `).run(CODE_HASH, DISCORD_ID, NOW.toISOString(), EXPIRES_AT);
  return database;
}

test("consuming an active link code links the Minecraft account exactly once", async () => {
  const database = await migratedDatabase();
  const linked = await consumeMinecraftLinkCode(d1(database), {
    discordUserId: DISCORD_ID,
    codeHash: CODE_HASH,
    minecraftUuid: PLAYER_UUID,
    minecraftName: "P2wn",
    now: NOW
  });

  assert.deepEqual(linked, {
    status: "LINKED",
    uuid: PLAYER_UUID,
    name: "P2wn"
  });
  assert.equal(
    database.prepare("SELECT discord_user_id FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(PLAYER_UUID).discord_user_id,
    DISCORD_ID
  );
  assert.notEqual(
    database.prepare("SELECT consumed_at FROM competition_link_codes WHERE code_hash = ?").get(CODE_HASH).consumed_at,
    null
  );
  database.close();
});

test("a link code removed after validation cannot create a Minecraft link", async () => {
  const database = await migratedDatabase();
  const db = d1(database, (connection) => {
    connection.prepare("DELETE FROM competition_link_codes WHERE code_hash = ?").run(CODE_HASH);
  });

  const linked = await consumeMinecraftLinkCode(db, {
    discordUserId: DISCORD_ID,
    codeHash: CODE_HASH,
    minecraftUuid: PLAYER_UUID,
    minecraftName: "P2wn",
    now: NOW
  });

  assert.deepEqual(linked, { status: "CONFLICT" });
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM competition_minecraft_links WHERE minecraft_uuid = ?").get(PLAYER_UUID).count,
    0
  );
  database.close();
});
