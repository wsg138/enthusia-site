const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
const DEFAULT_MODEL = "omni-moderation-latest";
const ALLOWED_MODELS = new Set([
  "omni-moderation-latest",
  "omni-moderation-2024-09-26"
]);

function selectedModel(env) {
  const configured = String(env?.OPENAI_MODERATION_MODEL ?? DEFAULT_MODEL).trim();
  return ALLOWED_MODELS.has(configured) ? configured : DEFAULT_MODEL;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedResult(payload, model) {
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!result || typeof result.flagged !== "boolean") {
    return {
      provider: "openai",
      model,
      outcome: "ERROR",
      categories: {},
      scores: {},
      appliedInputTypes: {},
      error: "invalid_response"
    };
  }

  return {
    provider: "openai",
    model: typeof payload.model === "string" ? payload.model : model,
    outcome: result.flagged ? "BLOCKED" : "PASSED",
    categories: normalizeObject(result.categories),
    scores: normalizeObject(result.category_scores),
    appliedInputTypes: normalizeObject(result.category_applied_input_types),
    error: null
  };
}

async function requestModeration(input, env, fetchImpl) {
  const model = selectedModel(env);
  const apiKey = typeof env?.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
  if (!apiKey) {
    return {
      provider: "openai",
      model,
      outcome: "ERROR",
      categories: {},
      scores: {},
      appliedInputTypes: {},
      error: "not_configured"
    };
  }

  try {
    const response = await fetchImpl(OPENAI_MODERATION_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, input })
    });

    if (!response.ok) {
      return {
        provider: "openai",
        model,
        outcome: "ERROR",
        categories: {},
        scores: {},
        appliedInputTypes: {},
        error: `http_${response.status}`
      };
    }

    return normalizedResult(await response.json(), model);
  } catch {
    return {
      provider: "openai",
      model,
      outcome: "ERROR",
      categories: {},
      scores: {},
      appliedInputTypes: {},
      error: "request_failed"
    };
  }
}

export function moderationModel(env) {
  return selectedModel(env);
}

export async function moderateText(text, env, fetchImpl = fetch) {
  if (typeof text !== "string" || !text.trim()) {
    throw new TypeError("Text moderation requires non-empty text");
  }
  return requestModeration([{ type: "text", text }], env, fetchImpl);
}

export async function moderateImageDataUrl(dataUrl, env, fetchImpl = fetch) {
  if (typeof dataUrl !== "string" || !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(dataUrl)) {
    throw new TypeError("Image moderation requires a supported image data URL");
  }
  return requestModeration(
    [{ type: "image_url", image_url: { url: dataUrl } }],
    env,
    fetchImpl
  );
}

export function moderationAllowsPublication(result) {
  return result?.outcome === "PASSED";
}
