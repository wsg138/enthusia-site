const DEFAULT_UPSTREAM_ORIGIN = "https://api.enthusia.info";

const BOARD_CONFIG = Object.freeze({
  "playtime-active-all": Object.freeze({
    assetPath: "/leaderboards/playtime-active-all.json",
    limit: 10,
    source: "asset",
  }),
  balance: Object.freeze({
    upstreamPath: "/api/leaderboards/balance",
    limit: 3,
    source: "upstream",
  }),
  guilds: Object.freeze({
    upstreamPath: "",
    limit: 5,
    upstreamLimit: 10,
    protected: true,
    source: "protected-upstream",
    defaultQuery: Object.freeze({
      period: "ALL_TIME",
    }),
  }),
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
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

async function readStaticLeaderboardAsset(request, path) {
  const assets = request?.env?.ASSETS;
  if (!assets || typeof assets.fetch !== "function") {
    return json({
      ok: false,
      error: "Static leaderboard assets are not available in this environment.",
    }, 500);
  }

  const url = new URL(path, request.request.url);
  const response = await assets.fetch(new Request(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  }));

  if (!response.ok) {
    return json({
      ok: false,
      status: response.status,
      error: "Static leaderboard export was not found.",
    }, response.status);
  }

  return new Response(await response.text(), {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "max-age=60, s-maxage=60",
    },
  });
}

function buildGuildsUrl(env) {
  if (!env.GUILDS_API_URL) {
    return null;
  }

  const url = new URL(env.GUILDS_API_URL);
  url.searchParams.set("period", BOARD_CONFIG.guilds.defaultQuery.period);
  url.searchParams.set("limit", String(BOARD_CONFIG.guilds.upstreamLimit || BOARD_CONFIG.guilds.limit));
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
  const board = String(context.params.board || "");
  const config = BOARD_CONFIG[board];

  if (!config) {
    return json({ ok: false, error: "Unknown leaderboard board." }, 404);
  }

  if (config.source === "asset") {
    return readStaticLeaderboardAsset(context, config.assetPath);
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
