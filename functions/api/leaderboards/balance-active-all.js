function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function contentTypeOf(object) {
  if (object.httpMetadata && object.httpMetadata.contentType) {
    return object.httpMetadata.contentType;
  }
  return "application/json; charset=utf-8";
}

export async function onRequestGet(context) {
  const bucket = context.env.BALANCE_LEADERBOARDS;
  if (!bucket || typeof bucket.get !== "function") {
    return json({
      ok: false,
      error: "Leaderboard R2 binding is not configured.",
      binding: "BALANCE_LEADERBOARDS"
    }, 500);
  }

  const key = "leaderboards/balance-active-all.json";
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
      "cache-control": "public, max-age=30",
      "access-control-allow-origin": "*"
    }
  });
}
