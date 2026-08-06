import { authenticateRequest, canReview } from "./lib/auth.js";

const PLAYER_ROUTES = new Set(["/appeal", "/appeal.html"]);

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  const reviewerRoute = path === "/reviewer" || path === "/reviewer/" || path.startsWith("/reviewer/");
  if (!PLAYER_ROUTES.has(path) && !reviewerRoute) return context.next();

  let session;
  try {
    session = await authenticateRequest(context.request, context.env);
  } catch {
    const login = new URL(context.env.ACCESS_LOGIN_URL ?? "/", context.request.url);
    login.searchParams.set("returnTo", path);
    return Response.redirect(login, 302);
  }

  if (reviewerRoute && !canReview(session, context.env)) {
    return new Response("Reviewer access required", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return context.next();
}
