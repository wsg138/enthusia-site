import test from 'node:test';
import assert from 'node:assert/strict';
import {projectGuildDirectory} from '../functions/lib/guild-directory-source.js';
import {projectSnapshot} from '../functions/lib/community/contracts.js';
const row={id:'vibe',name:'Vibe',level:100,memberCount:22,createdAt:'2026-05-02T17:53:30Z',totalExperience:19536419,activityScore:0,bankBalance:1011,score:119536419};
test('directory retains real founding dates, bank balance, XP and activity without inventing ELO or Prestige',()=>{
  const item=projectGuildDirectory({entries:[row]}).items[0];assert.equal(item.foundedAt,'2026-05-02T17:53:30.000Z');assert.equal(item.totalExperience,row.totalExperience);assert.equal(item.bankBalance,1011);assert.equal(item.activityScore,0);assert.equal(item.elo,null);assert.equal(item.prestige,null);assert.equal(item.peaceful,null);assert.equal(item.recruiting,null);assert.deepEqual(item.membersList,[]);
});
test('full guild snapshot fields survive projection while private fields are discarded',()=>{
  const input={id:'vibe',name:'Vibe',prestige:0,foundedAt:row.createdAt,elo:1200,bankBalance:1,totalExperience:2,activityScore:3,tag:'Vibe',membersList:['PublicPlayer'],homeLocation:'private',secret:'private'};
  const result=projectSnapshot('guilds',{items:[input]}).items[0];assert.equal(result.prestige,0);assert.equal(result.elo,1200);assert.equal(result.tag,'Vibe');assert.equal(JSON.stringify(result).includes('private'),false);
});
test('malformed public profile metrics and founding dates are rejected',()=>{
  for(const fields of [{prestige:-1},{foundedAt:'unknown'},{bankBalance:Infinity},{activityScore:-1},{totalExperience:'123'}])assert.throws(()=>projectSnapshot('guilds',{items:[{id:'vibe',name:'Vibe',...fields}]}));
});
