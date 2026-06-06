const DEFAULT_GUILDS_API_URL = "https://api.enthusia.info/api/leaderboards/guilds";

interface R2Object {
  body: BodyInit;
  httpMetadata?: {
    contentType?: string;
  };
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
}

interface Env {
  PLAYTIME_LEADERBOARDS?: R2Bucket;
  BALANCE_LEADERBOARDS?: R2Bucket;
  DONATOR_LEADERBOARDS?: R2Bucket;
  GUILDS_API_URL?: string;
  GUILDS_API_BEARER?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

interface RequestContext {
  env: Env;
  params: Record<string, string | string[] | undefined>;
}

interface R2BoardConfig {
  binding: keyof Pick<
    Env,
    "PLAYTIME_LEADERBOARDS" | "BALANCE_LEADERBOARDS" | "DONATOR_LEADERBOARDS"
  >;
  key: string;
  cacheSeconds: number;
}

interface GuildRequest {
  url: URL;
  headers: Record<string, string>;
}

interface CloudflareRequestInit extends RequestInit {
  cf: {
    cacheTtl: number;
    cacheEverything: boolean;
  };
}

const R2_BOARDS: Record<string, R2BoardConfig> = {
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

function json(data: unknown, status?: number): Response {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getRequestedBoard(
  params: Record<string, string | string[] | undefined>
): string {
  const rawPath = params && (params.path || params["path"] || params["path*"]);
  const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
  let board = String(path || "");
  while (board.startsWith("/")) {
    board = board.slice(1);
  }
  while (board.endsWith("/")) {
    board = board.slice(0, -1);
  }
  if (board.toLowerCase().endsWith(".json")) {
    board = board.slice(0, -5);
  }
  return board;
}

function getR2BoardConfig(board: string): R2BoardConfig | null {
  if (board === "playtime-active-all") {
    return R2_BOARDS["playtime-active-all"];
  }
  if (board === "balance-active-all") {
    return R2_BOARDS["balance-active-all"];
  }
  if (board === "donators-all-time") {
    return R2_BOARDS["donators-all-time"];
  }
  return null;
}

function getR2Bucket(
  env: Env,
  bindingName: R2BoardConfig["binding"]
): R2Bucket | undefined {
  if (bindingName === "PLAYTIME_LEADERBOARDS") {
    return env.PLAYTIME_LEADERBOARDS;
  }
  if (bindingName === "BALANCE_LEADERBOARDS") {
    return env.BALANCE_LEADERBOARDS;
  }
  if (bindingName === "DONATOR_LEADERBOARDS") {
    return env.DONATOR_LEADERBOARDS;
  }
  return undefined;
}

async function readR2Leaderboard(
  env: Env,
  config: R2BoardConfig
): Promise<Response> {
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

function buildGuildRequest(env: Env): GuildRequest | null {
  let url: URL;
  try {
    url = new URL(env.GUILDS_API_URL || DEFAULT_GUILDS_API_URL);
  } catch {
    return null;
  }

  const supportedProtocol = url.protocol === "https:" || url.protocol === "http:";
  if (!supportedProtocol || url.username || url.password) {
    return null;
  }

  url.searchParams.set("period", "ALL_TIME");
  url.searchParams.set("limit", "10");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.GUILDS_API_BEARER) {
    headers.Authorization = `Bearer ${env.GUILDS_API_BEARER}`;
  }
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  return { url, headers };
}

async function readGuildLeaderboard(env: Env): Promise<Response> {
  const request = buildGuildRequest(env);
  if (!request) {
    return json({
      ok: false,
      error: "Guild leaderboard proxy URL is invalid."
    }, 500);
  }

  const fetchOptions: CloudflareRequestInit = {
    method: "GET",
    headers: request.headers,
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  };
  const response = await fetch(request.url, fetchOptions);
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

export function onRequestGet(context: RequestContext): Response | Promise<Response> {
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

  const config = getR2BoardConfig(board);
  if (!config) {
    return json({ ok: false, error: "Unknown leaderboard board." }, 404);
  }

  return readR2Leaderboard(context.env, config);
}
