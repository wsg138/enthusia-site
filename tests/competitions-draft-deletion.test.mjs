import assert from "node:assert/strict";
import test from "node:test";

import { deleteCompetitionDraft } from "../functions/lib/competitions/draft-deletion.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000001";
const PLAYER_UUID = "20000000-0000-4000-8000-000000000002";
const DELETED_AT = "2026-08-30T20:00:00.000Z";

async function seededDatabase(lifecycleState = "DRAFT") {
  const database = await migratedDatabase();
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'deletion-test', 'Deletion Test', 'Build', ?, 1, 'staff-subject', ?, ?, ?)
  `).run(COMPETITION_ID, lifecycleState, PLAYER_UUID, DELETED_AT, DELETED_AT);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, '{}', 'staff-subject', ?, ?, 'Initial')
  `).run(COMPETITION_ID, PLAYER_UUID, DELETED_AT);
  return database;
}

function deletion() {
  return {
    competitionId: COMPETITION_ID,
    deletedBySubject: "staff-subject",
    deletedByUuid: PLAYER_UUID,
    deletedAt: DELETED_AT,
    reason: "Duplicate draft"
  };
}

test("draft deletion preserves its tombstone and removes the draft atomically", async () => {
  const database = await seededDatabase();
  assert.equal(await deleteCompetitionDraft(d1(database), deletion()), true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competitions WHERE id = ?").get(COMPETITION_ID).count, 0);
  const tombstone = database.prepare(`
    SELECT competition_id AS competitionId, deleted_by_subject AS deletedBySubject,
           deleted_by_uuid AS deletedByUuid, deleted_at AS deletedAt, reason
    FROM competition_deleted_drafts WHERE competition_id = ?
  `).get(COMPETITION_ID);
  assert.deepEqual({ ...tombstone }, deletion());
  database.close();
});

test("published competition state cannot race through draft deletion", async () => {
  const database = await seededDatabase("UPCOMING");
  assert.equal(await deleteCompetitionDraft(d1(database), deletion()), false);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competitions WHERE id = ?").get(COMPETITION_ID).count, 1);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competition_deleted_drafts").get().count, 0);
  database.close();
});
