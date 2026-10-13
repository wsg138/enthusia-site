import test from 'node:test';
import assert from 'node:assert/strict';
import {profileGuildQuests,profileBounties,profileDuelWins} from '../public/assets/player-activity-model.js';
import {connectCompleteProfileCapture} from '../scripts/lib/complete-profile-capture.mjs';
import {projectSnapshot} from '../functions/lib/community/contracts.js';
const id='10000000-0000-4000-8000-000000000001',guild='20000000-0000-4000-8000-000000000001';
const now=Date.parse('2026-10-13T00:00:00Z'),stamp='2026-10-12T12:00:00Z';
const player={id,name:'Player',guildsKnown:true,guildMemberships:[{id:guild,name:'Guild',level:40,banner:null}]};
test('quests match actual guild IDs and retain precision without inventing missing progress',()=>{
  const snapshot={currentWeekId:'week',limited:true,items:[{id:'week',startsAt:'2026-10-12T00:00:00Z',endsAt:'2026-10-19T00:00:00Z',quests:[{id:'quest',name:'Mine',targetCount:'9007199254740993',leaderboard:true,standings:[{guildId:guild,count:'9007199254740993',rank:1,claimed:true},{guildId:'other',count:'1',rank:2,claimed:false}]}]}]};
  const result=profileGuildQuests(player,snapshot,now);assert.equal(result.quests.length,1);assert.equal(result.quests[0].percent,100);assert.equal(result.quests[0].count,'9007199254740993');
  assert.equal(profileGuildQuests({...player,guildsKnown:false},snapshot,now),null);
  assert.equal(profileGuildQuests(player,snapshot,now+7*86400000).inactive,true);
});
test('bounty targets join by UUID only, excluding names and closed records',()=>{
  const rows=[{id,name:'Renamed',state:'open',gold:null},{id:'other',name:'Player',state:'open'},{id:'bounty-'+id,state:'claimed'}];
  assert.equal(profileBounties(player,{items:rows}).length,1);assert.equal(profileBounties(player,null),null);
  assert.deepEqual(profileBounties(player,{items:[{id,state:'open',expiresAt:'2020-01-01T00:00:00Z'}]}),[]);
});
test('a missing top-three leader is unknown, while complete personal totals can confirm zero',()=>{
  assert.deepEqual(profileDuelWins(player,{items:[]},now),{listed:false});
  const complete={...player,weeklyDuelWins:{wins:0,weekStartsAt:'2026-10-12T00:00:00Z',capturedAt:stamp}};
  assert.equal(profileDuelWins(complete,null,now).wins,0);assert.equal(profileDuelWins(complete,null,now).complete,true);
  const row={id:'duels-'+id,type:'leader',wins:3};assert.equal(profileDuelWins(player,{generatedAt:stamp,items:[row]},now).wins,3);
});
test('complete guild import replaces partial membership and strips unrelated private fields',()=>{
  const source={items:[{...player,guildsPartial:true}],generatedAt:stamp,sourceUpdatedAt:stamp};
  const result=connectCompleteProfileCapture(structuredClone(source),{playerGuilds:{generatedAt:stamp,items:[{id,guildMemberships:[],homes:'private'}]},players:{generatedAt:stamp,items:[{id,name:'Player',achievementsKnown:true,achievements:['Done'],weeklyDuelWins:{wins:0,weekStartsAt:'2026-10-12T00:00:00Z',capturedAt:stamp}}]}});
  assert.equal(result.players.items[0].guildsPartial,undefined);assert.deepEqual(result.players.items[0].guildMemberships,[]);
  assert.equal(result.players.items[0].achievements[0],'Done');assert.equal(JSON.stringify(result).includes('private'),false);
});
test('personal totals reject negative wins and non-Monday boundaries',()=>{
  for(const weeklyDuelWins of [{wins:-1,weekStartsAt:'2026-10-12T00:00:00Z',capturedAt:stamp},{wins:1,weekStartsAt:'2026-10-13T00:00:00Z',capturedAt:stamp}]){
    assert.throws(()=>projectSnapshot('players',{items:[{...player,weeklyDuelWins}]}),/invalid/);
  }
});
