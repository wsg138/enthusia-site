import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/assets/competitions-judge.js", import.meta.url), "utf8");

test("judge UI exposes the scoring backend bonus range", () => {
  assert.match(source, /name = "bonusPoints"/);
  assert.match(source, /bonus\.min = "-10"/);
  assert.match(source, /bonus\.max = "10"/);
  assert.match(source, /bonusPoints,/);
  assert.match(source, /bonusPoints < -10 \|\| bonusPoints > 10/);
});
