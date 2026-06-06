const DEFAULT_UPSTREAM_ORIGIN = "https://api.enthusia.info";
const DEFAULT_GUILDS_API_URL = `${DEFAULT_UPSTREAM_ORIGIN}/api/leaderboards/guilds`;
const PLAYTIME_PREFIX = "leaderboards";

const BOARD_CONFIG = {
  "playtime-active-all": {
    source: "playtime-r2",
    key: `${PLAYTIME_PREFIX}/playtime-active-all.json`
  },
  "balance-active-all": {
    source: "balance-r2",
    key: `${PLAYTIME_PREFIX}/balance-active-all.json`
  },
  "donators-all-time": {
    source: "donator-r2",
    key: `${PLAYTIME_PREFIX}/donators-all-time.json`
  },
  guilds: {
    source: "protected-upstream",
    upstreamLimit: 10,
    defaultQuery: {
      period: "ALL_TIME"
    }
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getRequestedPath(params) {
  const rawPath = params && (params.path || params["path"] || params["path*"]);
  if (Array.isArray(rawPath)) {
    return rawPath.join("/");
  }
  return typeof rawPath === "string" ? rawPath : "";
}

function normalizeBoardPath(path) {
  let value = String(path || "");
  while (value.startsWith("/")) {
    value = value.slice(1);
  }
  while (value.endsWith("/")) {
    value = value.slice(0, -1);
  }
  if (value.toLowerCase().endsWith(".json")) {
    value = value.slice(0, -5);
  }
  return value;
}

function getPlaytimeKey(path) {
  const boardPath = normalizeBoardPath(path);
  const file = boardPath ? `${boardPath}.json` : "index.json";
  return `${PLAYTIME_PREFIX}/${file}`;
}

async function readR2LeaderboardObject(env, bindingName, key, cacheSeconds) {
  const bucket = getR2Bucket(env, bindingName);
  if (!bucket || typeof bucket.get !== "function") {
    return json({
      ok: false,
      error: "Leaderboard R2 binding is not configured.",
      binding: bindingName
    }, 500);
  }

  const object = await bucket.get(key);
  if (!object) {
    return json({
      ok: false,
      error: "Leaderboard not found.",
      key: key
    }, 404);
  }

  return new Response(object.body, {
    headers: {
      "content-type": contentTypeOf(object),
      "cache-control": `public, max-age=${cacheSeconds}`,
      "access-control-allow-origin": "*"
    }
  });
}

function getR2Bucket(env, bindingName) {
  switch (bindingName) {
    case "PLAYTIME_LEADERBOARDS":
      return env.PLAYTIME_LEADERBOARDS;
    case "BALANCE_LEADERBOARDS":
      return env.BALANCE_LEADERBOARDS;
    case "DONATOR_LEADERBOARDS":
      return env.DONATOR_LEADERBOARDS;
    default:
      return false;
  }
}

function contentTypeOf(object) {
  if (object.httpMetadata && object.httpMetadata.contentType) {
    return object.httpMetadata.contentType;
  }
  return "application/json; charset=utf-8";
}

function getUpstreamOrigin(env) {
  try {
    if (env.GUILDS_API_URL) {
      const url = new URL(env.GUILDS_API_URL);
      return isAllowedUpstreamUrl(url) ? url.origin : DEFAULT_UPSTREAM_ORIGIN;
    }
  } catch {
    return DEFAULT_UPSTREAM_ORIGIN;
  }

  return DEFAULT_UPSTREAM_ORIGIN;
}

function getBoardConfig(board) {
  switch (board) {
    case "playtime-active-all":
      return BOARD_CONFIG["playtime-active-all"];
    case "balance-active-all":
      return BOARD_CONFIG["balance-active-all"];
    case "donators-all-time":
      return BOARD_CONFIG["donators-all-time"];
    case "guilds":
      return BOARD_CONFIG.guilds;
    default:
      return null;
  }
}

function buildPublicLeaderboardUrl(board, env) {
  const config = getBoardConfig(board);
  const url = new URL(config.upstreamPath, getUpstreamOrigin(env));
  url.searchParams.set("limit", String(config.limit));
  return url;
}

function buildGuildsUrl(env) {
  const url = new URL(env.GUILDS_API_URL || DEFAULT_GUILDS_API_URL);
  if (!isAllowedUpstreamUrl(url)) {
    return null;
  }

  const config = getBoardConfig("guilds");
  url.searchParams.set("period", config.defaultQuery.period);
  url.searchParams.set("limit", String(config.upstreamLimit));
  return url;
}

function isAllowedUpstreamUrl(url) {
  return url.protocol === "https:" && !url.username && !url.password;
}

function getGuildHeaders(env) {
  const hasAccessId = Boolean(env.CF_ACCESS_CLIENT_ID);
  const hasAccessSecret = Boolean(env.CF_ACCESS_CLIENT_SECRET);

  const headers = { Accept: "application/json" };
  if (env.GUILDS_API_BEARER) {
    headers.Authorization = `Bearer ${env.GUILDS_API_BEARER}`;
  }
  if (hasAccessId && hasAccessSecret) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

async function proxyJson(url, headers) {
  const response = await fetch(url, {
    method: "GET",
    headers,
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  });

  const text = await response.text();

  if (!response.ok) {
    return json({
      ok: false,
      status: response.status,
      error: "Leaderboard upstream request failed."
    }, response.status);
  }

  return new Response(text, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "max-age=15, s-maxage=15"
    }
  });
}

function readConfiguredLeaderboard(board, config, context) {
  if (config.source === "playtime-r2") {
    return readR2LeaderboardObject(context.env, "PLAYTIME_LEADERBOARDS", config.key, 60);
  }

  if (config.source === "balance-r2") {
    return readR2LeaderboardObject(context.env, "BALANCE_LEADERBOARDS", config.key, 30);
  }

  if (config.source === "donator-r2") {
    return readR2LeaderboardObject(context.env, "DONATOR_LEADERBOARDS", config.key, 60);
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
      error: "Guild leaderboard proxy URL is invalid."
    }, 500);
  }

  return proxyJson(url, headers);
}

export async function onRequestGet(context) {
  const path = getRequestedPath(context.params);
  const board = normalizeBoardPath(path);

  if (!board) {
    return readR2LeaderboardObject(context.env, "PLAYTIME_LEADERBOARDS", getPlaytimeKey(""), 60);
  }

  const config = getBoardConfig(board);
  if (!config) {
    return json({ ok: false, error: "Unknown leaderboard board." }, 404);
  }

  return readConfiguredLeaderboard(board, config, context);
}
