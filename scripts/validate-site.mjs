import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");
const htmlFiles = (await readdir(publicDir)).filter((file) => file.endsWith(".html"));
const errors = [];

for (const file of htmlFiles) {
  const fullPath = path.join(publicDir, file);
  const html = await readFile(fullPath, "utf8");

  for (const required of ["<meta name=\"viewport\"", "<meta name=\"description\""]) {
    if (!html.includes(required)) errors.push(`${file}: missing ${required}`);
  }

  const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    if (ids.filter((candidate) => candidate === id).length > 1) errors.push(`${file}: duplicate id ${id}`);
  }

  for (const match of html.matchAll(/\s(?:href|src)=["']([^"']+)["']/g)) {
    const reference = match[1].split(/[?#]/, 1)[0];
    if (!reference || /^(?:https?:|mailto:|tel:|data:|\/\/)/.test(reference)) continue;
    const localPath = reference.startsWith("/")
      ? path.join(publicDir, reference.slice(1))
      : path.resolve(path.dirname(fullPath), reference);
    try {
      await access(localPath);
    } catch {
      errors.push(`${file}: missing local reference ${reference}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages and their local references.`);
}
