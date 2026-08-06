const encoder = new TextEncoder();
const STAFF_API_ORIGIN = "https://staff-api.enthusia.info";
const STAFF_API_TIMEOUT_MS = 7000;
const STATIC_ROUTES = new Set([
  "/v1/website/appeals/eligible",
  "/v1/website/appeals/submit",
  "/v1/website/appeals/reviewer/list"
]);
const DECISION_ROUTE = /^\/v1\/website\/appeals\/reviewer\/[0-9a-f-]{36}\/decision$/i;

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

function staffApiConfiguration(env) {
  const bearer = typeof env.STAFF_API_BEARER_TOKEN === "string" ? env.STAFF_API_BEARER_TOKEN : "";
  const secret = typeof env.STAFF_API_HMAC_SECRET === "string" ? env.STAFF_API_HMAC_SECRET : "";
  if (bearer.length < 32 || secret.length < 32) throw new Error("Staff API is not configured");
  return { bearer, secret };
}

function staffRoute(path) {
  if (!STATIC_ROUTES.has(path) && !DECISION_ROUTE.test(path)) {
    throw new Error("Invalid Staff API route");
  }
  return path;
}

async function boundedFetch(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STAFF_API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function signedStaffRequest(env, path, body) {
  const configuration = staffApiConfiguration(env);
  const requestTarget = staffRoute(path);
  const payload = encoder.encode(JSON.stringify(body ?? {}));
  const method = "POST";
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const contentHash = base64Url(await sha256(payload));
  const canonical = `${method}\n${requestTarget}\n${timestamp}\n${nonce}\n${contentHash}`;
  const signature = base64Url(await hmacSha256(configuration.secret, canonical));

  return boundedFetch(`${STAFF_API_ORIGIN}${requestTarget}`, {
    method,
    headers: {
      authorization: `Bearer ${configuration.bearer}`,
      "content-type": "application/json",
      "x-enthusia-timestamp": timestamp,
      "x-enthusia-nonce": nonce,
      "x-enthusia-content-sha256": contentHash,
      "x-enthusia-signature": signature
    },
    body: payload
  });
}

export function reviewerRank(session) {
  const roles = new Set(session.roles);
  if (roles.has("founder")) return "FOUNDER";
  if (roles.has("admin")) return "ADMIN";
  if (roles.has("developer")) return "DEVELOPER";
  if (roles.has("moderator") || roles.has("mod")) return "MOD";
  return null;
}

export function staffApiResponse(upstream, cacheControl = "no-store") {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
      "cache-control": cacheControl
    }
  });
}

export { STAFF_API_ORIGIN, STAFF_API_TIMEOUT_MS, base64Url, staffApiConfiguration, staffRoute };
