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
  vm.runInContext(source, context);
  return { context, calls, node };
}
test('malformed appeal identifiers cannot produce a request destination', () => {
  const { context } = browser('review-appeals.js');
  for (const value of ['https://evil.example', '../other', '//evil.example', 'x?override=1', '123e4567-e89b-12d3-a456-426614174099/claim']) {
    assert.equal(context.decisionEndpoint(value), null);
  }
});
test('review decisions read textarea.value and keep conflict handling', async () => {
  const { context, calls, node } = browser('review-appeals.js');
  const result = {};
  await context.decide({ id: '123e4567-e89b-12d3-a456-426614174099', version: 2 }, 'deny', { value: 'A valid decision note', focus() {} }, result, node);
  assert.deepEqual(calls, ['/api/reviewer/appeals/123e4567-e89b-12d3-a456-426614174099']);
  assert.match(result.textContent, /changed/);
});
