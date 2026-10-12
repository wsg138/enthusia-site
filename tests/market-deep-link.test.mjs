import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedMarketStall} from '../public/assets/market/deep-link.js';
const stalls=[{id:'stall_35',owner:{type:'PLAYER',name:'.BedrockName'}},{id:'stall_36',owner:{type:'GUILD',name:'Guild'}}];
test('market links resolve stall aliases and public Bedrock player names',()=>{
  assert.equal(selectedMarketStall(stalls,new URLSearchParams('stall=Stall+35')).id,'stall_35');
  assert.equal(selectedMarketStall(stalls,new URLSearchParams('owner=.bedrockname')).id,'stall_35');
  assert.equal(selectedMarketStall(stalls,new URLSearchParams('owner=Guild')),null);
});
test('owner selection retains precedence while unknown owner preserves requested stall',()=>{
  assert.equal(selectedMarketStall(stalls,new URLSearchParams('stall=stall_36&owner=.BedrockName')).id,'stall_35');
  assert.equal(selectedMarketStall(stalls,new URLSearchParams('stall=stall_36&owner=missing')).id,'stall_36');
  assert.equal(selectedMarketStall(stalls,new URLSearchParams('stall=javascript:bad')),null);
});
