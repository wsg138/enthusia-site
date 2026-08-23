import assert from "node:assert/strict";
import test from "node:test";

import {
  createCompetitionMediaRecord,
  getCompetitionMediaForManager,
  getPublicCompetitionMedia
} from "../functions/lib/competitions/media-repository.js";

function fakeReadable(firstValue = null) {
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
        async first() {
          return firstValue;
        }
      };
    }
  };
}

function fakeWritable() {
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
      assert.equal(statements.length, 2);
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
    }
  };
}

test("generic media insert persists full moderation evidence and audit event", async () => {
  const db = fakeWritable();
  const result = await createCompetitionMediaRecord(db, {
    id: "media-1",
    competitionId: "competition-1",
    purpose: "BANNER",
    storageKey: "private/key.png",
    sha256: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 123,
    width: 1280,
    height: 720,
    moderation: {
      provider: "openai",
      model: "omni-moderation-latest",
      categories: { violence: false },
      scores: { violence: 0.001 },
      appliedInputTypes: { violence: ["image"] }
    },
    createdByUuid: "player-1",
    actorSubject: "discord-subject",
    createdAt: "2026-08-23T00:00:00.000Z",
    auditEventId: "audit-1"
  });

  assert.equal(result.id, "media-1");
  assert.match(db.calls[0].sql, /moderation_categories_json/);
  assert.match(db.calls[0].sql, /moderation_scores_json/);
  assert.match(db.calls[1].sql, /COMPETITION_MEDIA_CREATED/);
  assert.equal(db.calls[0].bindings.includes(JSON.stringify({ violence: false })), true);
});

test("manager media lookup is scoped to one competition and passed nonremoved assets", async () => {
  const db = fakeReadable({
    id: "media-1",
    competitionId: "competition-1",
    purpose: "BANNER",
    storageKey: "key",
    mimeType: "image/png",
    byteSize: 10,
    width: 20,
    height: 30,
    sha256: "hash"
  });
  const media = await getCompetitionMediaForManager(db, "competition-1", "media-1");
  assert.equal(media.storageKey, "key");
  assert.match(db.calls[0].sql, /removed_at IS NULL/);
  assert.match(db.calls[0].sql, /moderation_outcome = 'PASSED'/);
  assert.deepEqual(db.calls[0].bindings, ["media-1", "competition-1"]);
});

test("public media lookup only serves the currently referenced published banner", async () => {
  const db = fakeReadable(null);
  await getPublicCompetitionMedia(db, "media-1");
  const sql = db.calls[0].sql;
  assert.match(sql, /visibility IN \('PUBLIC', 'UNLISTED'\)/);
  assert.match(sql, /published_at IS NOT NULL/);
  assert.match(sql, /lifecycle_state NOT IN \('DRAFT', 'CANCELLED'\)/);
  assert.match(sql, /m\.purpose = 'BANNER'/);
  assert.match(sql, /json_extract\(v\.config_json, '\$\.appearance\.bannerImageId'\) = m\.id/);
  assert.deepEqual(db.calls[0].bindings, ["media-1"]);
});
