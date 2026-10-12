import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function browser(file) {
  const calls = [];
  const node = { value: 'OPEN', addEventListener() {}, focus() {}, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {} };
  const context = { document: { querySelector: () => node }, crypto: { randomUUID: () => 'test-replay-key' }, fetch: async (url) => { calls.push(url); return { status: 409, ok: false, json: async () => ({}) }; }, console };
  vm.createContext(context);
  let source = readFileSync(new URL('../public/assets/' + file, import.meta.url), 'utf8');
  source = source.replace(/Promise.all\(\[loadEligible\(\),\s*loadMine\(\)\]\);?\s*$/, '').replace(/load\(\);\s*$/, '');
  source = source.slice(0, source.indexOf("import "));
  vm.runInContext(source, context);
  return { context, calls, node };
}
test('malformed appeal identifiers cannot produce a request destination', () => {
  const { context } = browser('reviewer-appeals.js');
  for (const value of ['https://evil.example', '../other', '//evil.example', 'x?override=1', '123e4567-e89b-12d3-a456-426614174099/claim']) {
    assert.throws(() => context.checkedAppealId(value), /Invalid appeal/);
  }
});
test('valid appeal UUIDs are retained', () => {
  const { context } = browser('reviewer-appeals.js');
  assert.equal(context.checkedAppealId('123e4567-e89b-12d3-a456-426614174099'), '123e4567-e89b-12d3-a456-426614174099');
});
