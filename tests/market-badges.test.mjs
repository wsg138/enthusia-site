import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/assets/market/market.js', import.meta.url), 'utf8');
const start = source.indexOf('  const PRICE_BADGE_KINDS');
const end = source.indexOf('  function shopCard', start);
function renderBadge(badge) {
  let rendered;
  const card = { dataset: { shop: '7' }, querySelector: () => ({ after: node => { rendered = node; } }) };
  const context = { window: { EnthusiaMarketMap: { shopBadge: () => badge } }, adapter: { getShops: () => [{ id: 7 }] }, document: { createElement: () => ({}) } };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end) + '\nhydratePriceBadges(container);', Object.assign(context, { container: { querySelectorAll: () => [card] } }));
  return rendered;
}
test('provider badge HTML stays text and unknown kinds are rejected', () => {
  const node = renderBadge({ kind: 'cheap', text: '<img src=x onerror=alert(1)>' });
  assert.equal(node.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(node.className, 'price-badge cheap');
  assert.equal(node.innerHTML, undefined);
  assert.equal(renderBadge({ kind: 'cheap onclick=alert(1)', text: 'bad' }), undefined);
});
