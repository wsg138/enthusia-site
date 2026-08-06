export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function unauthorized() {
  return json({ error: "authentication_required" }, 401);
}

export function forbidden() {
  return json({ error: "reviewer_role_required" }, 403);
}

export function methodNotAllowed(allowed) {
  return json({ error: "method_not_allowed" }, 405, { allow: allowed.join(", ") });
}

export function serviceUnavailable() {
  return json({ error: "appeal_service_unavailable" }, 503);
}
