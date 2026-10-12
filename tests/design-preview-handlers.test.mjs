import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('design preview only dispatches explicitly registered own handlers', () => {
  const listeners = new Map();
  const doc = {
    readyState: 'complete', querySelectorAll: () => [], querySelector: () => null,
    addEventListener(name, callback) { listeners.set(name, callback); }
  };
  const window = {};
  let ownCalls = 0, inheritedCalls = 0;
  const values = Object.create({ inherited() { inheritedCalls++; } });
  values.allowed = function () { assert.equal(this, values); ownCalls++; };
  class Component { renderVals() { return values; } }
  vm.runInNewContext(readFileSync(new URL('../public/preview/design-reference/preview/mock.js', import.meta.url), 'utf8'), { document: doc, window });
  window.EnthusiaMock.mount(Component, {});
  const click = name => listeners.get('click')({
    target: { getAttribute: () => name, closest: () => null, parentNode: doc }
  });
  click('allowed');
  click('inherited');
  click('constructor');
  assert.equal(ownCalls, 1);
  assert.equal(inheritedCalls, 0);
});
