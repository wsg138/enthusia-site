import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "public");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true });
await rm(path.join(output, "northstar-a7k3m9"), { recursive: true, force: true });
await mkdir(path.join(output, ".openai"), { recursive: true });
await cp(path.join(root, ".openai", "hosting.json"), path.join(output, ".openai", "hosting.json"));
await mkdir(path.join(output, "server"), { recursive: true });
await writeFile(path.join(output, "server", "index.js"), `export default {
  async fetch(request, env) {
    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return new Response("Static asset binding is unavailable.", { status: 503 });
  }
};
`);

console.log("Built static site in dist/.");
