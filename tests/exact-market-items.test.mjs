import test from 'node:test';
import assert from 'node:assert/strict';
import { findMarketItem } from '../public/assets/market/exact-items.js';
const items=[{key:'diamond',name:'Diamond'},{key:'totem_of_undying',name:'Totem of Undying'}];
test('Discord alert material keys and chart labels resolve to the same item',()=>{
  assert.equal(findMarketItem(items,'diamond'),items[0]);
  assert.equal(findMarketItem(items,'minecraft:diamond'),items[0]);
  assert.equal(findMarketItem(items,'TOTEM_OF_UNDYING'),items[1]);
  assert.equal(findMarketItem(items,'Totem of Undying'),items[1]);
});
test('unknown materials do not silently select a different item',()=>{
  assert.equal(findMarketItem(items,'unknown'),undefined);
  assert.equal(findMarketItem(items,''),undefined);
});
