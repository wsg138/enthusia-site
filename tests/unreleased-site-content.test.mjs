import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function htmlFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const file = path.join(directory,entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(file));
    else if (entry.name.endsWith('.html')) out.push(file);
  }
  return out;
}

test('unreleased Christmas skin is absent from every published page and link', async () => {
  for (const file of await htmlFiles(fileURLToPath(new URL('../public/',import.meta.url)))) {
    assert.notEqual(path.basename(file),'home-christmas.html',file);
    const html = await readFile(file,'utf8');
    assert.doesNotMatch(html, /href\s*=\s*["'][^"']*home-christmas/i, file);
  }
});
