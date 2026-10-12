import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGuildQuests,questCount,progressPercent} from '../public/assets/guild-quests-model.js';
import {projectSnapshot} from '../functions/lib/community/contracts.js';
import {guildQuestPreview} from '../scripts/guild-quests-preview-data.mjs';
test('guild quest projection strips private progress and arbitrary producer fields',()=>{
  const input=guildQuestPreview();input.botToken='private';input.items[0].guilds[0].members=['private'];input.items[0].quests[0].standings[0].claimActorId='private';input.items[0].quests[0].standings[0].location='private';
  const result=projectSnapshot('guildquests',input);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(result.items[0].guilds[0].banner.baseColor,'BLUE');assert.deepEqual(projectGuildQuests(result),result);
});
test('counts preserve Long precision and progress never caps the leaderboard score',()=>{
  const max='9223372036854775807';assert.equal(questCount(max),max);assert.equal(progressPercent(max,'2000'),100);assert.equal(progressPercent('12','50'),24);
  for(const v of [9007199254740992,'9223372036854775808','1.0','-1','01'])assert.throws(()=>questCount(v));
});
test('quest snapshots reject unknown weeks, duplicate identifiers and invalid time windows',()=>{
  for(const mutate of [v=>v.currentWeekId='missing',v=>v.items[0].endsAt=v.items[0].startsAt,v=>v.items.push(v.items[0]),v=>v.items[0].quests.push(v.items[0].quests[0]),v=>v.items[0].guilds.push(v.items[0].guilds[0]),v=>v.generatedAt=new Date(Date.now()+120000).toISOString()]){const v=guildQuestPreview();mutate(v);assert.throws(()=>projectSnapshot('guildquests',v),/invalid_guildquests/);}
});
test('rank order and completion states follow the server contract',()=>{
  for(const mutate of [q=>q.standings[0].guildId='missing',q=>q.standings[0].rank=2,q=>q.standings[0].count='0',q=>q.standings[2].rewardDelivered=true,q=>q.standings[2].count='999999',q=>q.standings[1].guildId=q.standings[0].guildId,q=>q.payouts=[{rank:0,experience:1}]]){const v=guildQuestPreview();mutate(v.items[0].quests[0]);assert.throws(()=>projectGuildQuests(v));}
  const v=guildQuestPreview();v.items[0].quests[0].standings[0].count='9223372036854775807';assert.equal(projectGuildQuests(v).items[0].quests[0].standings[0].count,'9223372036854775807');
});
test('empty active rotation and archives remain distinguishable',()=>{
  const v=guildQuestPreview();v.currentWeekId=null;assert.equal(projectGuildQuests(v).currentWeekId,null);v.items=[];assert.deepEqual(projectGuildQuests(v).items,[]);
});
