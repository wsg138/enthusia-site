import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  advanceAutomaticCompetitionStates,
  SYSTEM_ACTOR_UUID,
  SYSTEM_SUBJECT
} from "../functions/lib/competitions/scheduled-jobs.js";

function d1(database) {
  function prepared(sql) {
    let params = [];
    return {
      bind(...values) {
        params = values;
        return this;
      },
      async all() {
        return { results: database.prepare(sql).all(...params) };
      },
      async first() {
        return database.prepare(sql).get(...params) ?? null;
      },
      async run() {
        const result = database.prepare(sql).run(...params);
        return { meta: { changes: Number(result.changes ?? 0) } };
      },
      _sql: sql,
      _params() { return params; }
    };
  }
  return {
    prepare: prepared,
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) {
          const result = database.prepare(statement._sql).run(...statement._params());
          results.push({ meta: { changes: Number(result.changes ?? 0) } });
        }
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
  return database;
}

test("scheduled lifecycle transition persists a non-null system audit actor", async () => {
  const database = await migratedDatabase();
  const db = d1(database);
  const competitionId = "10000000-0000-4000-8000-000000000010";
  const creatorUuid = "10000000-0000-4000-8000-000000000011";
  const now = "2026-08-23T05:00:00.000Z";
  const config = {
    schedule: {
      submissionsOpenAt: "2026-08-23T04:00:00.000Z",
      submissionsCloseAt: "2026-08-24T04:00:00.000Z"
    },
    voting: { enabled: false },
    judging: { enabled: false }
  };

  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at, published_at
    ) VALUES (?, 'scheduled-audit', 'Scheduled Audit', 'Build', 'UPCOMING', 1, 'staff:creator', ?, ?, ?, ?)
  `).run(competitionId, creatorUuid, now, now, now);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, ?, 'staff:creator', ?, ?, 'seed')
  `).run(competitionId, JSON.stringify(config), creatorUuid, now);

  const outcomes = await advanceAutomaticCompetitionStates(db, new Date(now));
  assert.deepEqual(outcomes.map(({ from, to, status }) => ({ from, to, status })), [
    { from: "UPCOMING", to: "SUBMISSIONS_OPEN", status: "UPDATED" }
  ]);

  const competition = database.prepare("SELECT lifecycle_state AS state FROM competitions WHERE id = ?").get(competitionId);
  assert.equal(competition.state, "SUBMISSIONS_OPEN");
  const audit = database.prepare(`
    SELECT actor_subject AS subject, actor_uuid AS actorUuid, action
    FROM competition_audit_events
    WHERE competition_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(competitionId);
  assert.equal(audit.subject, SYSTEM_SUBJECT);
  assert.equal(audit.actorUuid, SYSTEM_ACTOR_UUID);
  assert.equal(audit.action, "COMPETITION_STATE_CHANGED");
  database.close();
});
