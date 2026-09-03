import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  REQUIRED_COMPETITION_SCHEMA_VERSION,
  currentCompetitionSchemaStatus
} from "../functions/lib/competitions/schema-readiness.js";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

function adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      let values = [];
      return {
        bind(...input) {
          values = input;
          return this;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async first() {
          return statement.get(...values) ?? null;
        }
      };
    }
  };
}

test("fully migrated D1 schema reports the exact current release version", async () => {
  const database = await migratedDatabase();
  const status = await currentCompetitionSchemaStatus(adapter(database));
  assert.equal(status.ready, true);
  assert.equal(status.schemaVersion, REQUIRED_COMPETITION_SCHEMA_VERSION);
  assert.equal(status.requiredSchemaVersion, 27);
  assert.deepEqual(status.missing, []);
  database.close();
});

test("an older schema marker cannot pass readiness even when early tables still exist", async () => {
  const database = await migratedDatabase();
  database.prepare("UPDATE competition_schema_meta SET schema_version = 26 WHERE schema_key = 'core'").run();
  const status = await currentCompetitionSchemaStatus(adapter(database));
  assert.equal(status.ready, false);
  assert.equal(status.schemaVersion, 26);
  assert.equal(status.missing.length, 0);
  database.close();
});

test("missing late-release trigger cannot pass readiness with a current version marker", async () => {
  const database = await migratedDatabase();
  database.exec("DROP TRIGGER competition_contributor_invite_discord_notification");
  const status = await currentCompetitionSchemaStatus(adapter(database));
  assert.equal(status.ready, false);
  assert.equal(status.schemaVersion, REQUIRED_COMPETITION_SCHEMA_VERSION);
  assert.deepEqual(status.missing, [{ type: "trigger", name: "competition_contributor_invite_discord_notification" }]);
  database.close();
});
