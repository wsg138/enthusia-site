const DEFAULT_GUILDS_API_URL = "https://api.enthusia.info/api/leaderboards/guilds";

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function buildGuildsUrl(env) {
  const url = new URL(env.GUILDS_API_URL || DEFAULT_GUILDS_API_URL);
  if (!isAllowedUpstreamUrl(url)) {
    return null;
  }

  url.searchParams.set("period", "ALL_TIME");
  url.searchParams.set("limit", "10");
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

export async function onRequestGet(context) {
  const url = buildGuildsUrl(context.env);
  const headers = getGuildHeaders(context.env);

  if (!url || !headers) {
    return json({
      ok: false,
      error: "Guild leaderboard proxy URL is invalid."
    }, 500);
  }

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
