function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function buildGuildsUrl(env) {
  if (!env.GUILDS_API_URL) {
    return null;
  }

  const url = new URL(env.GUILDS_API_URL);
  url.searchParams.set("period", "ALL_TIME");
  url.searchParams.set("limit", "10");
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

export async function onRequestGet(context) {
  const url = buildGuildsUrl(context.env);
  const headers = getGuildHeaders(context.env);

  if (!url || !headers) {
    return json({
      ok: false,
      error: "Guild leaderboard proxy is not configured.",
    }, 500);
  }

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
