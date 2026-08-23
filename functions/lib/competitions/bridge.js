const encoder = new TextEncoder();
const BRIDGE_TIMEOUT_MS = 5000;
const ROUTES = new Set([
  "/v1/competitions/player-context",
  "/v1/competitions/player-lookup",
  "/v1/competitions/rewards/deliver",
  "/v1/competitions/notifications/submission",
  "/v1/competitions/notifications/contributor"
]);

function base64Url(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function configuration(env) {
  const rawOrigin = typeof env?.COMPETITION_BRIDGE_ORIGIN === "string"
    ? env.COMPETITION_BRIDGE_ORIGIN.trim()
    : "";
  const bearer = typeof env?.COMPETITION_BRIDGE_BEARER_TOKEN === "string"
    ? env.COMPETITION_BRIDGE_BEARER_TOKEN
    : "";
  const secret = typeof env?.COMPETITION_BRIDGE_HMAC_SECRET === "string"
    ? env.COMPETITION_BRIDGE_HMAC_SECRET
    : "";
  if (!rawOrigin || bearer.length < 32 || secret.length < 32) {
    throw new Error("Competition bridge is not configured");
  }
  const origin = new URL(rawOrigin).origin;
  if (!origin.startsWith("https://")) throw new Error("Competition bridge requires HTTPS");
  return { origin, bearer, secret };
}

function route(path) {
  if (!ROUTES.has(path)) throw new Error("Invalid competition bridge route");
  return path;
}

async function boundedFetch(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function signedCompetitionBridgeRequest(env, path, body) {
  const config = configuration(env);
  const requestTarget = route(path);
  const payload = encoder.encode(JSON.stringify(body ?? {}));
  const method = "POST";
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const contentHash = base64Url(await sha256(payload));
  const canonical = `${method}\n${requestTarget}\n${timestamp}\n${nonce}\n${contentHash}`;
  const signature = base64Url(await hmacSha256(config.secret, canonical));

  return boundedFetch(`${config.origin}${requestTarget}`, {
    method,
    headers: {
      authorization: `Bearer ${config.bearer}`,
      "content-type": "application/json",
      "x-enthusia-timestamp": timestamp,
      "x-enthusia-nonce": nonce,
      "x-enthusia-content-sha256": contentHash,
      "x-enthusia-signature": signature
    },
    body: payload
  });
}

export async function competitionPlayerContext(env, session) {
  const response = await signedCompetitionBridgeRequest(env, "/v1/competitions/player-context", {
    accountSubject: session.subject,
    playerUuid: session.player.uuid
  });
  if (!response.ok) throw new Error(`Competition bridge player context failed: ${response.status}`);
  const body = await response.json();
  if (
    !body
    || typeof body !== "object"
    || !Array.isArray(body.linkedMinecraftAccounts)
    || !Number.isFinite(body.activeMinutes)
    || !Array.isArray(body.guilds)
  ) {
    throw new Error("Competition bridge returned invalid player context");
  }
  return {
    activeMinutes: Math.max(0, Math.floor(body.activeMinutes)),
    linkedMinecraftAccounts: body.linkedMinecraftAccounts,
    guilds: body.guilds,
    fetchedAt: typeof body.fetchedAt === "string" ? body.fetchedAt : null
  };
}

export async function competitionPlayerLookup(env, minecraftName) {
  const name = typeof minecraftName === "string" ? minecraftName.trim() : "";
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new TypeError("Minecraft name is invalid");
  const response = await signedCompetitionBridgeRequest(env, "/v1/competitions/player-lookup", { minecraftName: name });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Competition bridge player lookup failed: ${response.status}`);
  const body = await response.json();
  const uuid = String(body?.uuid ?? "").trim().toLowerCase();
  const canonicalName = String(body?.name ?? "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid)
    || !/^[A-Za-z0-9_]{1,16}$/.test(canonicalName)
  ) {
    throw new Error("Competition bridge returned invalid player lookup");
  }
  return { uuid, name: canonicalName };
}

export { BRIDGE_TIMEOUT_MS, configuration as competitionBridgeConfiguration, route as competitionBridgeRoute };
