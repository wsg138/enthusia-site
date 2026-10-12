import assert from "node:assert/strict";
import test from "node:test";

import {
  linkedMinecraftAccount,
  MAX_LINKED_ACCOUNTS,
  normalizedLinks
} from "../functions/lib/competitions/participant-auth.js";

function uuid(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

test("linked account normalization accepts only canonical player identities", () => {
  const firstUuid = uuid(1);
  const links = normalizedLinks({
    linkedMinecraftAccounts: [
      null,
      { uuid: "not-a-uuid", name: "Invalid" },
      { uuid: firstUuid.toUpperCase(), name: "  Player_1  " },
      { uuid: uuid(2), name: "name-is-too-long-for-minecraft" }
    ]
  });

  assert.deepEqual([...links.values()], [{ uuid: firstUuid, name: "Player_1" }]);
});

test("linked account normalization stops at the supported identity limit", () => {
  const links = normalizedLinks({
    linkedMinecraftAccounts: Array.from({ length: MAX_LINKED_ACCOUNTS + 2 }, (_, index) => ({
      uuid: uuid(index + 1),
      name: `Player${index + 1}`
    }))
  });

  assert.equal(links.size, MAX_LINKED_ACCOUNTS);
  assert.equal(links.has(uuid(MAX_LINKED_ACCOUNTS)), true);
  assert.equal(links.has(uuid(MAX_LINKED_ACCOUNTS + 1)), false);
});

test("linked account selection defaults safely and rejects unlinked identities", () => {
  const session = {
    linkedMinecraftAccounts: [
      { uuid: uuid(1), name: "Player1" },
      { uuid: uuid(2), name: "Player2" }
    ]
  };

  assert.deepEqual(linkedMinecraftAccount(session), { uuid: uuid(1), name: "Player1" });
  assert.deepEqual(linkedMinecraftAccount(session, uuid(2).toUpperCase()), { uuid: uuid(2), name: "Player2" });
  assert.equal(linkedMinecraftAccount(session, "not-a-uuid"), null);
  assert.equal(linkedMinecraftAccount(session, uuid(3)), null);
  assert.equal(linkedMinecraftAccount({ linkedMinecraftAccounts: [] }), null);
});
