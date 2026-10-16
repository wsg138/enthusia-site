import test from 'node:test';
import assert from 'node:assert/strict';
import {marketHistoryModel,applyMarketHistory,marketMovers,historyPosition,previousMarketWinner} from '../public/assets/market/history-model.js';
test('ledger model keeps unavailable comparisons and unattributed sales separate from rankings',()=>{
  const data={week:'2026-10-12T00:00:00.000Z',weeks:[],prices:[{item:'diamond',price:14,quantity:3,change:null}],leaders:[],stallTotals:[{stall:'',gold:42}],hallOfFame:[]};
  const model=marketHistoryModel(data,data);
  assert.equal(model.items[0].d7,null);assert.equal(model.items[0].d1,null);
  assert.deepEqual(model.stallTotals,{});assert.deepEqual(model.live,[]);
});
test('unknown and wrong-direction comparisons cannot become biggest risers or fallers',()=>{
  const items=[{name:'unknown',d7:null},{name:'up',d7:5},{name:'down',d7:-2},{name:'flat',d7:0}];
  assert.deepEqual(marketMovers(items,'up').map(row=>row.name),['up']);
  assert.deepEqual(marketMovers(items,'down').map(row=>row.name),['down']);
});
test('sparse daily history retains calendar spacing and known-empty state',()=>{
  const item={};applyMarketHistory(item,[{day:'2026-10-01',price:10},{day:'2026-10-11',price:20}]);
  const end=Date.parse('2026-10-13');
  assert.ok(Math.abs(historyPosition(item.days,1,end)-historyPosition(item.days,0,end)-10/30)<1e-12);
  assert.equal(item.lo,10);assert.equal(item.hi,20);
  applyMarketHistory(item,[]);assert.equal(item.loaded,true);assert.deepEqual(item.days,[]);
});
test('an older hall entry is not presented as last weeks winner',()=>{
  const model={currentWeek:'2026-10-12T00:00:00.000Z',winners:[{week:'2026-09-28',name:'Older'}]};
  assert.equal(previousMarketWinner(model),undefined);
  model.winners.push({week:'2026-10-05',name:'Last week'});
  assert.equal(previousMarketWinner(model).name,'Last week');
});
