import test from 'node:test';
import assert from 'node:assert/strict';
import {connectPublicGuilds} from '../scripts/lib/public-player-guilds.mjs';
import {projectSnapshot} from '../functions/lib/community/contracts.js';
const player='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',guild='20000000-0000-4000-8000-000000000001';
const players={items:[{id:player,name:'Player'},{id:other,name:'Other'}]};
const board={generatedAt:new Date().toISOString(),entries:[{id:guild,name:'Guild',level:40,memberCount:20,topMemberUuids:[player.toUpperCase(),player],homes:'private'}]};
test('public top members prove positive UUID membership without claiming a full roster or no guild',()=>{
  const data=connectPublicGuilds(players,board,null);
  assert.equal(data.players.items[0].guildsPartial,true);
  assert.equal(data.players.items[0].guildMemberships.length,1);
  assert.equal(data.players.items[1].guildsKnown,undefined);
  assert.equal(JSON.stringify(data).includes('private'),false);
  assert.equal(projectSnapshot('players',data.players).items[0].guildsPartial,true);
});
test('real banner designs join by guild UUID only; delegated access is not membership',()=>{
  const market={stalls:[{owner:{type:'GUILD',id:guild,avatar:{kind:'GUILD_BANNER',banner:{baseColor:'BLUE',patterns:[]}}},members:[other]}]};
  const data=connectPublicGuilds(players,board,market);
  assert.equal(data.players.items[0].guildMemberships[0].banner.baseColor,'BLUE');
  assert.equal(data.players.items[1].guildsKnown,undefined);
  assert.equal(data.guildDirectory.items[0].banner.baseColor,'BLUE');
});
test('a complete authoritative lookup is not replaced by partial leaderboard associations',()=>{
  const data=connectPublicGuilds({items:[{id:player,name:'Player',guildsKnown:true,guildMemberships:[]}]},board,null);
  assert.deepEqual(data.players.items[0].guildMemberships,[]);
  assert.equal(data.players.items[0].guildsPartial,undefined);
});
