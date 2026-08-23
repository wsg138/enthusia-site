import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { appearancePurpose } from "../functions/api/competitions/admin/[id]/media/index.js";
import { initialCompetitionConfig, sanitizeCompetitionConfig } from "../functions/lib/competitions/config.js";
import {
  createAndAttachCompetitionAppearanceMedia,
  getPublicCompetitionMedia
} from "../functions/lib/competitions/media-repository.js";
import { competitionMediaKey } from "../functions/lib/competitions/media-storage.js";
import { publicCompetitionConfig } from "../functions/lib/competitions/public.js";

const COMPETITION_ID = "11111111-1111-4111-8111-111111111111";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";

async function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  for (const file of files) database.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  return database;
}

function fakeWritable(changes = [1, 1, 1]) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        }
      };
    },
    async batch(statements) {
      assert.equal(statements.length, changes.length);
      return changes.map((value) => ({ meta: { changes: value } }));
    }
  };
}

function fakeReadable() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() { return null; }
      };
    }
  };
}

const moderation = {
  provider: "openai",
  model: "omni-moderation-latest",
  categories: {},
  scores: {},
  appliedInputTypes: {}
};

test("appearance config preserves banner icon category art and safe public projection", () => {
  const input = initialCompetitionConfig();
  input.appearance.bannerImageId = "banner-id";
  input.appearance.iconImageId = "icon-id";
  input.appearance.categoryImageId = "category-id";
  input.appearance.accent = "#abcdef";
  const sanitized = sanitizeCompetitionConfig(input);
  assert.deepEqual(sanitized.appearance, {
    bannerImageId: "banner-id",
    iconImageId: "icon-id",
    categoryImageId: "category-id",
    accent: "#ABCDEF"
  });
  assert.deepEqual(publicCompetitionConfig(sanitized).appearance, sanitized.appearance);
});

test("typed appearance uploads use distinct private storage paths", () => {
  assert.equal(
    competitionMediaKey({ competitionId: COMPETITION_ID, mediaId: MEDIA_ID, extension: "png", purpose: "icon" }),
    `competitions/${COMPETITION_ID}/icon/${MEDIA_ID}.png`
  );
  assert.equal(
    competitionMediaKey({ competitionId: COMPETITION_ID, mediaId: MEDIA_ID, extension: "jpg", purpose: "category" }),
    `competitions/${COMPETITION_ID}/category/${MEDIA_ID}.jpg`
  );
});

test("appearance upload header defaults to banner and accepts only known types", () => {
  assert.equal(appearancePurpose(new Request("https://example.test")).database, "BANNER");
  assert.equal(appearancePurpose(new Request("https://example.test", { headers: { "x-competition-media-purpose": "icon" } })).field, "iconImageId");
  assert.equal(appearancePurpose(new Request("https://example.test", { headers: { "x-competition-media-purpose": "category" } })).storage, "category");
  assert.equal(appearancePurpose(new Request("https://example.test", { headers: { "x-competition-media-purpose": "other" } })), null);
});

test("appearance attach preserves draft/version concurrency guard for icon media", async () => {
  const db = fakeWritable();
  const result = await createAndAttachCompetitionAppearanceMedia(db, {
    id: MEDIA_ID,
    competitionId: COMPETITION_ID,
    purpose: "ICON",
    expectedVersion: 3,
    storageKey: `competitions/${COMPETITION_ID}/icon/${MEDIA_ID}.png`,
    sha256: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 100,
    width: 256,
    height: 256,
    moderation,
    config: { schemaVersion: 1, appearance: { iconImageId: MEDIA_ID } },
    actorSubject: "staff:1",
    actorUuid: "33333333-3333-4333-8333-333333333333",
    createdAt: "2026-08-23T04:30:00.000Z",
    operationId: "operation-1",
    auditEventId: "audit-1"
  });
  assert.equal(result.status, "UPDATED");
  assert.equal(result.appearanceField, "iconImageId");
  assert.equal(result.configVersion, 4);
  assert.match(db.calls[0].sql, /'ICON'/);
  assert.match(db.calls[0].sql, /lifecycle_state = 'DRAFT'/);
  assert.match(db.calls[2].sql, /COMPETITION_ICON_UPDATED/);
});

test("public appearance lookup only serves currently referenced typed assets", async () => {
  const db = fakeReadable();
  await getPublicCompetitionMedia(db, MEDIA_ID);
  const sql = db.calls[0].sql;
  assert.match(sql, /m\.purpose = 'BANNER'.*bannerImageId/s);
  assert.match(sql, /m\.purpose = 'ICON'.*iconImageId/s);
  assert.match(sql, /m\.purpose = 'CATEGORY'.*categoryImageId/s);
  assert.match(sql, /moderation_outcome = 'PASSED'/);
  assert.match(sql, /published_at IS NOT NULL/);
});

test("appearance media migration accepts only the declared media purposes", async () => {
  const database = await migratedDatabase();
  const now = "2026-08-23T04:30:00.000Z";
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'appearance-test', 'Appearance Test', 'Build', 'DRAFT', 1, 'staff:test', ?, ?, ?)
  `).run(COMPETITION_ID, "33333333-3333-4333-8333-333333333333", now, now);

  const insert = (id, purpose) => database.prepare(`
    INSERT INTO competition_media (
      id, competition_id, purpose, storage_key, sha256, mime_type,
      byte_size, width, height, moderation_provider, moderation_model,
      moderation_outcome, moderation_categories_json, moderation_scores_json,
      moderation_applied_input_types_json, created_by_uuid, created_at
    ) VALUES (?, ?, ?, ?, ?, 'image/png', 10, 16, 16, 'openai', 'omni-moderation-latest', 'PASSED', '{}', '{}', '{}', ?, ?)
  `).run(
    id,
    COMPETITION_ID,
    purpose,
    `competitions/${COMPETITION_ID}/${purpose.toLowerCase()}/${id}.png`,
    "b".repeat(64),
    "33333333-3333-4333-8333-333333333333",
    now
  );

  insert(MEDIA_ID, "ICON");
  insert("44444444-4444-4444-8444-444444444444", "CATEGORY");
  assert.throws(() => insert("55555555-5555-4555-8555-555555555555", "UNSAFE"), /CHECK constraint failed/);
  database.close();
});
