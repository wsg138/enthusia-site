import assert from "node:assert/strict";
import test from "node:test";

import { authorizeCompetitionRead } from "../functions/lib/competitions/public-access.js";

function context(env = {}) {
  return {
    env,
    request: new Request("https://preview.example/api/competitions")
  };
}

async function responsePayload(result) {
  return result.response ? result.response.json() : null;
}

test("competition read authorization returns 404 while the feature is disabled", async () => {
  let authenticatorCalled = false;
  const result = await authorizeCompetitionRead(context(), async () => {
    authenticatorCalled = true;
    return { roles: ["founder"] };
  });
  assert.equal(result.response.status, 404);
  assert.deepEqual(await responsePayload(result), { error: "not_found" });
  assert.equal(authenticatorCalled, false);
});

test("private preview returns 404 to unauthenticated and unauthorized callers", async () => {
  const env = { COMPETITIONS_ENABLED: "true" };

  const unauthenticated = await authorizeCompetitionRead(context(env), async () => {
    throw new Error("not signed in");
  });
  assert.equal(unauthenticated.response.status, 404);

  const member = await authorizeCompetitionRead(context(env), async () => ({ roles: ["member"] }));
  assert.equal(member.response.status, 404);
});

test("Founder and Admin can read the private competition preview", async () => {
  const env = { COMPETITIONS_ENABLED: "true" };
  for (const role of ["founder", "admin"]) {
    const result = await authorizeCompetitionRead(context(env), async () => ({ roles: [role] }));
    assert.equal(result.response, undefined);
    assert.equal(result.publicAccess, false);
    assert.deepEqual(result.session.roles, [role]);
  }
});

test("explicit public access bypasses preview authentication only when enabled", async () => {
  const env = {
    COMPETITIONS_ENABLED: "true",
    COMPETITIONS_PUBLIC_ACCESS: "true"
  };
  let authenticatorCalled = false;
  const result = await authorizeCompetitionRead(context(env), async () => {
    authenticatorCalled = true;
    throw new Error("should not authenticate");
  });
  assert.equal(result.response, undefined);
  assert.equal(result.publicAccess, true);
  assert.equal(result.session, null);
  assert.equal(authenticatorCalled, false);
});
