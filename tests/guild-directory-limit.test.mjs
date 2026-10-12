import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet, readGuildDirectory } from "../functions/api/leaderboards/[[path]].js";

test("the directory requests the supported 50 records while rankings remain top ten", async (t) => {
  const limits = [];
  t.mock.method(globalThis, "fetch", async (target) => {
    const url = new URL(target);
    if (url.pathname === "/api/leaderboards/guilds") limits.push(url.searchParams.get("limit"));
    return Response.json({ entries: [] });
  });
  const env = { GUILDS_API_URL: "https://api.enthusia.info/api/leaderboards/guilds?limit=100000" };
  assert.equal((await readGuildDirectory(env)).status, 200);
  assert.equal((await onRequestGet({ env, params: { path: "guilds" } })).status, 200);
  assert.deepEqual(limits, ["50", "10"]);
});
