import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const WIKI_OUTPUT_ROOT = path.join(PROJECT_ROOT, "wiki-worker-output");

function configuredPath(value, fallback) {
  const configured = typeof value === "string" ? value.trim() : "";
  return configured || fallback;
}

function resolveFromProject(value) {
  return path.resolve(PROJECT_ROOT, value);
}

function isDescendant(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative)
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

function requireDescendant(root, candidate, label) {
  if (!isDescendant(root, candidate)) {
    throw new Error(`${label} must stay inside ${root}`);
  }
  return candidate;
}

export function projectInputPath(value, fallback, label) {
  const candidate = resolveFromProject(configuredPath(value, fallback));
  return requireDescendant(PROJECT_ROOT, candidate, label);
}

export function wikiOutputPath(value, fallback = "wiki-worker-output/rendered") {
  const candidate = resolveFromProject(configuredPath(value, fallback));
  return requireDescendant(WIKI_OUTPUT_ROOT, candidate, "Wiki render output");
}

export function containedFilename(directory, filename, label = "Generated filename") {
  if (typeof filename !== "string" || !filename || path.basename(filename) !== filename) {
    throw new Error(`${label} must be a single filename`);
  }
  return requireDescendant(path.resolve(directory), path.resolve(directory, filename), label);
}

export function wikiPageFilename(id) {
  if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Wiki page ID is invalid");
  }
  return `${id}.wiki`;
}
