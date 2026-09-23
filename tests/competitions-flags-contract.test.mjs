import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return database;
}

test("submission moderation schema contains private investigation flag fields", async () => {
  const database = await migratedDatabase();
  const columns = new Set(database.prepare("PRAGMA table_info(submission_moderation)").all().map((row) => row.name));
  assert.ok(columns.has("flag_reason"));
  assert.ok(columns.has("flagged_by_uuid"));
  assert.ok(columns.has("flagged_at"));
  database.close();
});

test("staff API and UI expose flag and clear-flag operations while public projection stays private", async () => {
  const [api, staffRepository, ui, bootstrap, publicProjection] = await Promise.all([
    readFile(new URL("../functions/api/competitions/admin/[id]/submissions/[submissionId].js", import.meta.url), "utf8"),
    readFile(new URL("../functions/lib/competitions/staff-submissions.js", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/competitions-admin-flags.js", import.meta.url), "utf8"),
    readFile(new URL("../public/assets/competitions-admin-bootstrap.js", import.meta.url), "utf8"),
    readFile(new URL("../functions/lib/competitions/public.js", import.meta.url), "utf8")
  ]);

  assert.match(api, /"FLAG"/);
  assert.match(api, /"CLEAR_FLAG"/);
  assert.match(api, /setSubmissionFlag/);
  assert.match(staffRepository, /flag_reason AS flagReason/);
  assert.match(ui, /Flag for investigation/);
  assert.match(ui, /Clear flag/);
  assert.match(bootstrap, /competitions-admin-flags\.js/);
  assert.doesNotThrow(() => new Function(ui));
  assert.doesNotMatch(publicProjection, /flag_reason|flagReason|flagged_at|flaggedAt/);
});
