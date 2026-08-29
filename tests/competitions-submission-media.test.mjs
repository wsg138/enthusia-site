import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { reorderOwnedSubmissionImages } from "../functions/lib/competitions/submission-image-order.js";
import {
  attachSubmissionImage,
  nextSubmissionImageSortOrder,
  removeSubmissionImage
} from "../functions/lib/competitions/submission-media.js";
import { attachStaffSubmissionImage } from "../functions/lib/competitions/staff-media.js";
import { d1, migratedDatabase } from "./support/d1-sqlite.mjs";

const COMPETITION_ID = "10000000-0000-4000-8000-000000000001";
const SUBMISSION_ID = "20000000-0000-4000-8000-000000000002";
const OWNER_UUID = "30000000-0000-4000-8000-000000000003";
const IMAGE_ID = "40000000-0000-4000-8000-000000000004";
const DISCORD_ID = "1".repeat(18);
const OWNER_SUBJECT = `discord:${DISCORD_ID}`;
const NOW = "2026-08-28T14:00:00.000Z";

async function seededDatabase({
  lifecycleState = "SUBMISSIONS_OPEN",
  submissionStatus = "DRAFT",
  ownerSubject = OWNER_SUBJECT
} = {}) {
  const database = await migratedDatabase();
  database.prepare(`
    INSERT INTO competitions (
      id, slug, title, category, lifecycle_state, current_config_version,
      created_by_subject, created_by_uuid, created_at, updated_at
    ) VALUES (?, 'media-guard', 'Media Guard', 'Build', ?, 1, 'owner', ?, ?, ?)
  `).run(COMPETITION_ID, lifecycleState, OWNER_UUID, NOW, NOW);
  database.prepare(`
    INSERT INTO competition_config_versions (
      competition_id, version, config_json, created_by_subject,
      created_by_uuid, created_at, change_note
    ) VALUES (?, 1, '{}', 'owner', ?, ?, 'Initial')
  `).run(COMPETITION_ID, OWNER_UUID, NOW);
  if (ownerSubject === OWNER_SUBJECT) {
    database.prepare(`
      INSERT INTO competition_discord_accounts (
        discord_user_id, username, created_at, updated_at
      ) VALUES (?, 'Owner', ?, ?)
    `).run(DISCORD_ID, NOW, NOW);
    database.prepare(`
      INSERT INTO competition_minecraft_links (
        minecraft_uuid, discord_user_id, minecraft_name, linked_at, updated_at
      ) VALUES (?, ?, 'Owner', ?, ?)
    `).run(OWNER_UUID, DISCORD_ID, NOW, NOW);
  }
  database.prepare(`
    INSERT INTO submissions (
      id, competition_id, entry_type, status, owner_subject, owner_uuid,
      owner_name, title, description, revision, created_at, updated_at
    ) VALUES (?, ?, 'SOLO', ?, ?, ?, 'Owner', 'Entry', 'Description', 1, ?, ?)
  `).run(SUBMISSION_ID, COMPETITION_ID, submissionStatus, ownerSubject, OWNER_UUID, NOW, NOW);
  return database;
}

function playerImage(overrides = {}) {
  return {
    id: IMAGE_ID,
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    ownerSubject: OWNER_SUBJECT,
    actorUuid: OWNER_UUID,
    expectedRevision: 1,
    expectedConfigVersion: 1,
    reviewCloseAt: null,
    sortOrder: 0,
    storageKey: `competitions/${COMPETITION_ID}/submissions/${IMAGE_ID}.png`,
    sha256: "a".repeat(64),
    mimeType: "image/png",
    byteSize: 100,
    width: 16,
    height: 16,
    moderation: { provider: "OpenAI", model: "omni-moderation-latest", categories: {}, scores: {} },
    moderationCheckId: "50000000-0000-4000-8000-000000000005",
    auditEventId: "60000000-0000-4000-8000-000000000006",
    createdAt: NOW,
    ...overrides
  };
}

test("new submission images use the next free position after the highest active image", () => {
  assert.equal(nextSubmissionImageSortOrder([]), 0);
  assert.equal(nextSubmissionImageSortOrder([
    { sortOrder: 0 },
    { sortOrder: 2 }
  ]), 3);
});

test("submission image position calculation rejects corrupt stored positions", () => {
  assert.throws(() => nextSubmissionImageSortOrder([{ sortOrder: -1 }]), /sort order is invalid/);
  assert.throws(() => nextSubmissionImageSortOrder([{ sortOrder: 1.5 }]), /sort order is invalid/);
});

test("player and staff upload routes calculate an explicit image position", async () => {
  const sources = await Promise.all([
    readFile(new URL("../functions/api/competitions/[slug]/submissions/[id]/images/index.js", import.meta.url), "utf8"),
    readFile(new URL("../functions/api/competitions/admin/[id]/submissions/[submissionId]/images/index.js", import.meta.url), "utf8")
  ]);
  for (const source of sources) {
    assert.match(source, /nextSubmissionImageSortOrder\(images\)/);
    assert.doesNotMatch(source, /existing\.length/);
  }
});

test("player media writes stop when the competition locks after validation", async () => {
  const database = await seededDatabase();
  const db = d1(database);
  assert.deepEqual(await attachSubmissionImage(db, playerImage()), { status: "UPDATED", revision: 2 });
  database.prepare("UPDATE competitions SET lifecycle_state = 'VOTING' WHERE id = ?").run(COMPETITION_ID);

  assert.deepEqual(await reorderOwnedSubmissionImages(db, {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    ownerSubject: OWNER_SUBJECT,
    actorUuid: OWNER_UUID,
    expectedRevision: 2,
    expectedConfigVersion: 1,
    reviewCloseAt: null,
    imageIds: [IMAGE_ID],
    coverImageId: IMAGE_ID,
    updatedAt: "2026-08-28T14:01:00.000Z",
    auditEventId: "70000000-0000-4000-8000-000000000007"
  }), { status: "CONFLICT" });
  assert.deepEqual(await removeSubmissionImage(db, {
    competitionId: COMPETITION_ID,
    submissionId: SUBMISSION_ID,
    imageId: IMAGE_ID,
    ownerSubject: OWNER_SUBJECT,
    actorUuid: OWNER_UUID,
    expectedRevision: 2,
    expectedConfigVersion: 1,
    reviewCloseAt: null,
    removedAt: "2026-08-28T14:02:00.000Z",
    auditEventId: "80000000-0000-4000-8000-000000000008"
  }), { status: "CONFLICT" });

  assert.equal(database.prepare("SELECT revision FROM submissions WHERE id = ?").get(SUBMISSION_ID).revision, 2);
  assert.equal(database.prepare("SELECT removed_at FROM submission_images WHERE id = ?").get(IMAGE_ID).removed_at, null);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM competition_audit_events").get().count, 1);
  database.close();
});

test("player changes requested after the review deadline do not attach media", async () => {
  const database = await seededDatabase({ lifecycleState: "REVIEW", submissionStatus: "NEEDS_CHANGES" });
  const result = await attachSubmissionImage(d1(database), playerImage({
    reviewCloseAt: "2026-08-28T13:59:00.000Z"
  }));
  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM submission_images").get().count, 0);
  database.close();
});

test("staff media writes also recheck the current competition lifecycle", async () => {
  const staffSubject = "staff-manual:test";
  const database = await seededDatabase({
    lifecycleState: "VOTING",
    submissionStatus: "PENDING_REVIEW",
    ownerSubject: staffSubject
  });
  const result = await attachStaffSubmissionImage(d1(database), {
    ...playerImage({ ownerSubject: staffSubject }),
    actorSubject: "staff:test",
    expectedConfigVersion: 1
  });
  assert.deepEqual(result, { status: "CONFLICT" });
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM submission_images").get().count, 0);
  database.close();
});
