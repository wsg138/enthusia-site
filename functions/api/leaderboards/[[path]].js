const DEFAULT_GUILDS_API_URL = "https://api.enthusia.info/api/leaderboards/guilds";

const R2_BOARDS = {
  "playtime-active-all": {
    binding: "PLAYTIME_LEADERBOARDS",
    key: "leaderboards/playtime-active-all.json",
    cacheSeconds: 60
  },
  "balance-active-all": {
    binding: "BALANCE_LEADERBOARDS",
    key: "leaderboards/balance-active-all.json",
    cacheSeconds: 30
  },
  "donators-all-time": {
    binding: "DONATOR_LEADERBOARDS",
    key: "leaderboards/donators-all-time.json",
    cacheSeconds: 60
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

function getRequestedBoard(params) {
  const rawPath = params && (params.path || params["path"] || params["path*"]);
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  return String(path || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.json$/i, "");
}

function getR2Bucket(env, bindingName) {
  if (bindingName === "PLAYTIME_LEADERBOARDS") {
    return env.PLAYTIME_LEADERBOARDS;
  }
  if (bindingName === "BALANCE_LEADERBOARDS") {
    return env.BALANCE_LEADERBOARDS;
  }
  if (bindingName === "DONATOR_LEADERBOARDS") {
    return env.DONATOR_LEADERBOARDS;
  }
  return false;
}

async function readR2Leaderboard(env, config) {
  const bucket = getR2Bucket(env, config.binding);
  if (!bucket || typeof bucket.get !== "function") {
    return json({
      ok: false,
      error: "Leaderboard R2 binding is not configured.",
      binding: config.binding
    }, 500);
  }

  const object = await bucket.get(config.key);
  if (!object) {
    return json({
      ok: false,
      error: "Leaderboard not found.",
      key: config.key
    }, 404);
  }

  const contentType = object.httpMetadata && object.httpMetadata.contentType
    ? object.httpMetadata.contentType
    : "application/json; charset=utf-8";

  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "cache-control": `public, max-age=${config.cacheSeconds}`,
      "access-control-allow-origin": "*"
    }
  });
}

function buildGuildRequest(env) {
  let url;
  try {
    url = new URL(env.GUILDS_API_URL || DEFAULT_GUILDS_API_URL);
  } catch {
    return false;
  }

  const supportedProtocol = url.protocol === "https:" || url.protocol === "http:";
  if (!supportedProtocol || url.username || url.password) {
    return false;
  }

  url.searchParams.set("period", "ALL_TIME");
  url.searchParams.set("limit", "10");

  const headers = { Accept: "application/json" };
  if (env.GUILDS_API_BEARER) {
    headers.Authorization = `Bearer ${env.GUILDS_API_BEARER}`;
  }
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  return { url, headers };
}

async function readGuildLeaderboard(env) {
  const request = buildGuildRequest(env);
  if (!request) {
    return json({
      ok: false,
      error: "Guild leaderboard proxy URL is invalid."
    }, 500);
  }

  const response = await fetch(request.url, {
    method: "GET",
    headers: request.headers,
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

export function onRequestGet(context) {
  const board = getRequestedBoard(context.params);
  if (!board) {
    return readR2Leaderboard(context.env, {
      binding: "PLAYTIME_LEADERBOARDS",
      key: "leaderboards/index.json",
      cacheSeconds: 60
    });
  }

  if (board === "guilds") {
    return readGuildLeaderboard(context.env);
  }

  const config = R2_BOARDS[board];
  if (!config) {
    return json({ ok: false, error: "Unknown leaderboard board." }, 404);
  }

  return readR2Leaderboard(context.env, config);
}
