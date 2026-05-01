const DEFAULT_UPSTREAM_ORIGIN = "https://api.enthusia.info";
const PLAYTIME_PREFIX = "leaderboards";

const BOARD_CONFIG = Object.freeze({
  "playtime-active-all": Object.freeze({
    source: "playtime-r2",
    key: `${PLAYTIME_PREFIX}/playtime-active-all.json`,
  }),
  "balance-active-all": Object.freeze({
    source: "balance-r2",
    key: `${PLAYTIME_PREFIX}/balance-active-all.json`,
  }),
  guilds: Object.freeze({
    source: "protected-upstream",
    upstreamLimit: 10,
    defaultQuery: Object.freeze({
      period: "ALL_TIME",
    }),
  }),
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function getRequestedPath(params) {
  const rawPath = params?.path ?? params?.["path"] ?? params?.["path*"];
  if (Array.isArray(rawPath)) {
    return rawPath.join("/");
  }
  return typeof rawPath === "string" ? rawPath : "";
}

function normalizeBoardPath(path) {
  return String(path || "").replace(/^\/+|\/+$/g, "").replace(/\.json$/i, "");
}

function getPlaytimeKey(path) {
  const boardPath = normalizeBoardPath(path);
  const file = boardPath ? `${boardPath}.json` : "index.json";
  return `${PLAYTIME_PREFIX}/${file}`;
}

async function readR2LeaderboardObject(env, bindingName, key, cacheSeconds) {
  const bucket = env[bindingName];
  if (!bucket || typeof bucket.get !== "function") {
    return json({
      ok: false,
      error: "Leaderboard R2 binding is not configured.",
      binding: bindingName,
    }, 500);
  }

  const object = await bucket.get(key);
  if (!object) {
    return json({
      ok: false,
      error: "Leaderboard not found.",
      key,
    }, 404);
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType || "application/json; charset=utf-8",
      "cache-control": `public, max-age=${cacheSeconds}`,
      "access-control-allow-origin": "*",
    },
  });
}

function getUpstreamOrigin(env) {
  try {
    if (env.GUILDS_API_URL) {
      return new URL(env.GUILDS_API_URL).origin;
    }
  } catch {
    return DEFAULT_UPSTREAM_ORIGIN;
  }

  return DEFAULT_UPSTREAM_ORIGIN;
}

function buildPublicLeaderboardUrl(board, env) {
  const config = BOARD_CONFIG[board];
  const url = new URL(config.upstreamPath, getUpstreamOrigin(env));
  url.searchParams.set("limit", String(config.limit));
  return url;
}

function buildGuildsUrl(env) {
  if (!env.GUILDS_API_URL) {
    return null;
  }

  const url = new URL(env.GUILDS_API_URL);
  url.searchParams.set("period", BOARD_CONFIG.guilds.defaultQuery.period);
  url.searchParams.set("limit", String(BOARD_CONFIG.guilds.upstreamLimit));
  return url;
}

function getGuildHeaders(env) {
  if (!env.GUILDS_API_BEARER || !env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET) {
    return null;
  }

  return {
    Accept: "application/json",
    Authorization: `Bearer ${env.GUILDS_API_BEARER}`,
    "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
  };
}

async function proxyJson(url, headers) {
  const response = await fetch(url, {
    method: "GET",
    headers,
    cf: {
      cacheTtl: 0,
      cacheEverything: false,
    },
  });

  const text = await response.text();

  if (!response.ok) {
    return json({
      ok: false,
      status: response.status,
      error: "Leaderboard upstream request failed.",
    }, response.status);
  }

  return new Response(text, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "max-age=15, s-maxage=15",
    },
  });
}

export async function onRequestGet(context) {
  const path = getRequestedPath(context.params);
  const board = normalizeBoardPath(path);

  if (!board) {
    return readR2LeaderboardObject(context.env, "PLAYTIME_LEADERBOARDS", getPlaytimeKey(""), 60);
  }

  const config = BOARD_CONFIG[board];
  if (!config) {
    return json({ ok: false, error: "Unknown leaderboard board." }, 404);
  }

  if (config.source === "playtime-r2") {
    return readR2LeaderboardObject(context.env, "PLAYTIME_LEADERBOARDS", config.key, 60);
  }

  if (config.source === "balance-r2") {
    return readR2LeaderboardObject(context.env, "BALANCE_LEADERBOARDS", config.key, 30);
  }

  if (config.source === "upstream") {
    const url = buildPublicLeaderboardUrl(board, context.env);
    return proxyJson(url, { Accept: "application/json" });
  }

  const url = buildGuildsUrl(context.env);
  const headers = getGuildHeaders(context.env);

  if (!url || !headers) {
    return json({
      ok: false,
      error: "Guild leaderboard proxy is not configured.",
    }, 500);
  }

  return proxyJson(url, headers);
}
