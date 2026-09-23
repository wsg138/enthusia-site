import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { competitionBridgeConfiguration } from "../functions/lib/competitions/bridge.js";

const BASE = {
  COMPETITION_BRIDGE_ORIGIN: "https://bridge-dev.enthusia.info",
  COMPETITION_BRIDGE_BEARER_TOKEN: "b".repeat(48),
  COMPETITION_BRIDGE_HMAC_SECRET: "h".repeat(48)
};

test("bridge works without Access credentials when Access service auth is not required", () => {
  const config = competitionBridgeConfiguration(BASE);
  assert.equal(config.accessRequired, false);
  assert.equal(config.accessClientId, null);
  assert.equal(config.accessClientSecret, null);
});

test("bridge Access service credentials must be supplied as a complete pair", () => {
  assert.throws(
    () => competitionBridgeConfiguration({ ...BASE, COMPETITION_BRIDGE_ACCESS_CLIENT_ID: "client.access" }),
    /Access service credentials are incomplete/
  );
  assert.throws(
    () => competitionBridgeConfiguration({ ...BASE, COMPETITION_BRIDGE_ACCESS_CLIENT_SECRET: "s".repeat(32) }),
    /Access service credentials are incomplete/
  );
});

test("required bridge Access service auth fails closed when credentials are absent", () => {
  assert.throws(
    () => competitionBridgeConfiguration({ ...BASE, COMPETITION_BRIDGE_ACCESS_REQUIRED: "true" }),
    /Access service authentication is required/
  );
});

test("bridge configuration rejects undeployed template values", () => {
  assert.throws(
    () => competitionBridgeConfiguration({
      ...BASE,
      COMPETITION_BRIDGE_ORIGIN: "https://REPLACE_WITH_PRIVATE_BRIDGE_HOST"
    }),
    /template values/
  );
  assert.throws(
    () => competitionBridgeConfiguration({
      ...BASE,
      COMPETITION_BRIDGE_BEARER_TOKEN: "REPLACE_WITH_BRIDGE_BEARER_TOKEN_VALUE"
    }),
    /template values/
  );
});

test("bridge configuration requires an exact HTTPS origin", () => {
  assert.throws(
    () => competitionBridgeConfiguration({ ...BASE, COMPETITION_BRIDGE_ORIGIN: "https://bridge-dev.enthusia.info/v1" }),
    /must not include/
  );
  assert.throws(
    () => competitionBridgeConfiguration({ ...BASE, COMPETITION_BRIDGE_ORIGIN: "https://bridge-dev.enthusia.info?target=other" }),
    /must not include/
  );
  assert.throws(
    () => competitionBridgeConfiguration({ ...BASE, COMPETITION_BRIDGE_ORIGIN: "http://bridge-dev.enthusia.info" }),
    /requires HTTPS/
  );
});

test("bridge Access service credentials are retained for outgoing requests", () => {
  const config = competitionBridgeConfiguration({
    ...BASE,
    COMPETITION_BRIDGE_ACCESS_REQUIRED: "true",
    COMPETITION_BRIDGE_ACCESS_CLIENT_ID: "1234567890abcdef.access",
    COMPETITION_BRIDGE_ACCESS_CLIENT_SECRET: "s".repeat(48)
  });
  assert.equal(config.accessRequired, true);
  assert.equal(config.accessClientId, "1234567890abcdef.access");
  assert.equal(config.accessClientSecret, "s".repeat(48));
});

test("bridge request source sends the standard Cloudflare Access service-token headers", async () => {
  const source = await readFile(new URL("../functions/lib/competitions/bridge.js", import.meta.url), "utf8");
  assert.match(source, /CF-Access-Client-Id/);
  assert.match(source, /CF-Access-Client-Secret/);
});
