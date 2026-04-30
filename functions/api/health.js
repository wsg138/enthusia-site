export function onRequestGet() {
  return Response.json({
    ok: true,
    service: "enthusia-site",
    timestamp: new Date().toISOString(),
  });
}
