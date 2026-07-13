import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assets = path.join(root, "public", "assets");
const expectedWidth = 1672;
const expectedHeight = 941;
const pngNames = [
  "minecraft-terrain-mask-v1.png",
  "minecraft-sky-mask-v1.png",
  "minecraft-terrain-foreground-day-v1.png",
  "minecraft-terrain-foreground-sunset-v1.png",
  "minecraft-terrain-foreground-night-v1.png",
  "minecraft-terrain-foreground-sunrise-v1.png",
  "minecraft-occlusion-add-v2.png",
  "minecraft-occlusion-subtract-v2.png",
];
const knownHashes = new Map([
  ["minecraft-terrain-mask-v1.png", "83243e15123c1c7aeaf1510048ec4d41c841ed8b108aba118544b46c551137fb"],
  ["minecraft-occlusion-add-v2.png", "ad67cf27acd411f3eb3e3bee0539fc8143da4a362cec5a48676dda3a728e69c7"],
  ["minecraft-occlusion-subtract-v2.png", "1fc3b72c778177c1e2863696b3acff8840a20a398d6dab8fcaa0e691604ecf1f"],
  ["minecraft-occlusion-repair-v2.json", "f45dfd8cd457afc2b6829a3b8b2ba6048ac025e005d26da6fc6e2ab21f112a6a"],
]);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function requiredFile(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Missing required deployment asset: ${filePath}`);
    throw error;
  }
}

for (const name of pngNames) {
  const filePath = path.join(assets, name);
  const data = await requiredFile(filePath);
  if (data.length < 24 || !data.subarray(0, 8).equals(pngSignature) || data.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error(`${name} is not a valid PNG with an IHDR header`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${name} must be ${expectedWidth}x${expectedHeight}; got ${width}x${height}`);
  }
}

await requiredFile(path.join(assets, "minecraft-occlusion-repair-v2.json"));

for (const [name, expected] of knownHashes) {
  const data = await requiredFile(path.join(assets, name));
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== expected) throw new Error(`${name} SHA-256 mismatch: expected ${expected}, got ${actual}`);
}

const runtime = await requiredFile(path.join(assets, "script.js"));
const runtimeSource = runtime.toString("utf8");
const v8Reference = "minecraft-terrain-foreground-${name}-v1.png?v=8";
if (!runtimeSource.includes(v8Reference)) {
  throw new Error("public/assets/script.js is missing the required v8 foreground asset reference");
}
if (runtimeSource.includes("minecraft-terrain-foreground-${name}-v1.png?v=7")) {
  throw new Error("public/assets/script.js still refers to v7 foreground assets");
}

console.log("Cinematic deployment assets validated.");
