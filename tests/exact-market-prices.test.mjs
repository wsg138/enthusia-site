import test from 'node:test';
import assert from 'node:assert/strict';
import { rawGoldUnitPrice,priceVerdict } from '../public/assets/market/exact-prices.js';
const shop={direction:'SELL',sellAmount:4,costAmount:2,costItem:{material:'RAW_GOLD'},sellItem:{material:'STONE',metadata:{}}};
test('design price badges compare raw gold unit costs with recorded prices',()=>{
  assert.equal(rawGoldUnitPrice(shop),.5);assert.equal(priceVerdict(shop,1).kind,'cheap');assert.equal(priceVerdict(shop,.25).kind,'pricey');assert.equal(priceVerdict(shop,.5).kind,'fair');
});
test('other currencies, buying shops, decorated items and invalid quantities remain incomparable',()=>{
  for(const value of [{...shop,costItem:{material:'GOLD_INGOT'}},{...shop,direction:'BUY'},{...shop,sellAmount:0},{...shop,sellItem:{metadata:{name:'Special'}}}])assert.equal(priceVerdict(value,1),null);
});
