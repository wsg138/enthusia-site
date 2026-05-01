function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export async function onRequestGet(context) {
  const bucket = context.env.BALANCE_LEADERBOARDS;
  if (!bucket || typeof bucket.get !== "function") {
    return json({
      ok: false,
      error: "Leaderboard R2 binding is not configured.",
      binding: "BALANCE_LEADERBOARDS",
    }, 500);
  }

  const key = "leaderboards/balance-active-all.json";
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
      "cache-control": "public, max-age=30",
      "access-control-allow-origin": "*",
    },
  });
}
