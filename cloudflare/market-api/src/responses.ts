const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(JSON.stringify(data), { status, headers });
}

export function error(code: string, message: string, status: number, extra: HeadersInit = {}): Response {
  return json({ ok: false, error: { code, message } }, status, extra);
}

export function withPublicCors(response: Response, origin: string | null): Response {
  const copy = new Response(response.body, response);
  copy.headers.set("Vary", "Origin");
  if (origin) copy.headers.set("Access-Control-Allow-Origin", origin);
  return copy;
}
