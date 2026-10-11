const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TOKEN_MAX_LENGTH = 2048;
const TIMEOUT_MS = 5000;

function configuredSecret(env) {
  const secret = typeof env?.TURNSTILE_SECRET_KEY === "string" ? env.TURNSTILE_SECRET_KEY.trim() : "";
  if (secret.length < 20) throw new Error("Turnstile secret is not configured");
  return secret;
}

export function turnstileSiteKey(env) {
  const siteKey = typeof env?.TURNSTILE_SITE_KEY === "string" ? env.TURNSTILE_SITE_KEY.trim() : "";
  if (siteKey.length < 10 || siteKey.length > 128) throw new Error("Turnstile site key is not configured");
  return siteKey;
}

export function sanitizeTurnstileToken(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || token.length > TOKEN_MAX_LENGTH) return null;
  return token;
}

export async function verifyTurnstile(env, token, { action = null } = {}) {
  const responseToken = sanitizeTurnstileToken(token);
  if (!responseToken) return false;
  const secret = configuredSecret(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        secret,
        response: responseToken,
        idempotency_key: crypto.randomUUID()
      }),
      signal: controller.signal
    });
    if (!response.ok) return false;
    const result = await response.json();
    if (result?.success !== true) return false;
    if (action && result.action !== action) return false;
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

export { VERIFY_URL as TURNSTILE_VERIFY_URL };
