import assert from "node:assert/strict";
import test from "node:test";

import { punishmentQuery } from "../functions/api/punishments.js";

test("public punishment queries permit only bounded filters and cursors", () => {
  const query = punishmentQuery(new Request("https://example.test/api/punishments?type=ban&cursor=abc_123"));
  assert.equal(query.path, "/v1/public/punishments");
  assert.equal(query.parameters.get("type"), "BAN");
  assert.equal(query.parameters.get("cursor"), "abc_123");
  assert.equal(query.parameters.get("limit"), "30");
  assert.equal(punishmentQuery(new Request("https://example.test/api/punishments?type=private")), null);
  assert.equal(punishmentQuery(new Request("https://example.test/api/punishments?cursor=bad%2Fcursor")), null);
});

test("public punishment search is isolated from list parameters", () => {
  const query = punishmentQuery(new Request("https://example.test/api/punishments?q=PlayerOne&type=BAN&cursor=ignored"));
  assert.equal(query.path, "/v1/public/search");
  assert.deepEqual([...query.parameters], [["q", "PlayerOne"]]);
  assert.equal(punishmentQuery(new Request(`https://example.test/api/punishments?q=${"x".repeat(81)}`)), null);
});
