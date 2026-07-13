import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import "./validate-cinematic-deploy-assets.mjs";

const root = process.cwd();
const source = path.join(root, "public");
const output = path.join(root, "dist");
const client = path.join(output, "client");

await rm(output, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await cp(source, client, { recursive: true });
await cp(path.join(source, "plugins.html"), path.join(client, "about.html"));
await cp(path.join(source, "404.html"), path.join(client, "branded-not-found.html"));
await rm(path.join(client, "northstar-a7k3m9"), { recursive: true, force: true });
await mkdir(path.join(output, ".openai"), { recursive: true });
await cp(path.join(root, ".openai", "hosting.json"), path.join(output, ".openai", "hosting.json"));
await mkdir(path.join(output, "server"), { recursive: true });
await writeFile(path.join(output, "server", "index.js"), `export default {
  async fetch(request, env) {
    if (env?.ASSETS?.fetch) {
      const url = new URL(request.url);
      if (url.pathname === "/about" || url.pathname === "/about/") {
        url.pathname = "/about.html";
        return env.ASSETS.fetch(new Request(url, request));
      }
      if (url.pathname === "/market" || url.pathname === "/market/") {
        url.pathname = "/market.html";
        return env.ASSETS.fetch(new Request(url, request));
      }
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
      url.pathname = "/branded-not-found.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    return new Response("Static asset binding is unavailable.", { status: 503 });
  }
};
`);

console.log("Built static site in dist/.");
