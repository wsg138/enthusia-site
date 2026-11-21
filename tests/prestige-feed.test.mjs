import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {handleCommunity} from '../functions/lib/community/service.js';
import {projectPrestige,readPrestige} from '../functions/lib/live-prestige.js';

const sample = JSON.parse(readFileSync(new URL('../public/preview/prestige/sample.json', import.meta.url)));
const env = {GUILDS_PRESTIGE_API_URL:'https://guilds.example/api/community/prestige',GUILDS_API_BEARER:'test-token'};
const clock = Date.parse(sample.generatedAt);
test('public endpoint keeps an empty server snapshot separate from an unavailable feed', async () => {
  const empty={...sample,guilds:[],recent:[],tiers:sample.tiers.map(t=>({...t,first:null,guildCount:0})),
    totals:{prestiges:0,guildsPrestiged:0,tiersClaimed:0,goldSpent:0}};
  const context={request:new Request('https://example.org/api/community/prestige'),env:{},params:{path:'prestige'}};
  assert.equal((await handleCommunity(context)).status,503);
  context.env.COMMUNITY_DB={prepare:sql=>({first:async()=>sql.includes("'prestige'")?{payload:JSON.stringify(empty)}:null})};
  const response=await handleCommunity(context);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).guilds,[]);
});
test('prestige accepts the supplied contract and rejects incomplete, private or inconsistent records', () => {
  assert.equal(projectPrestige(sample).revision, sample.revision);
  for (const change of [
    s => {delete s.guilds[0].banner;},
    s => {s.guilds[0].privateNote='hidden';},
    s => {s.guilds[0].hallRank=2;},
    s => {s.guilds[0].history.reverse();},
    s => {s.guilds[0].history[0].creditedTotal=-1;}
  ]) {
    const invalid=structuredClone(sample);
    change(invalid);
    assert.throws(()=>projectPrestige(invalid), /invalid_prestige/);
  }
});
test('reader authenticates, rejects redirects, and distinguishes fresh, stale and unavailable', async () => {
  const upstream=async (url,options)=>{
    assert.equal(String(url),env.GUILDS_PRESTIGE_API_URL);
    assert.equal(options.headers.Authorization,'Bearer test-token');
    assert.equal(options.redirect,'error');
    return Response.json(sample);
  };
  assert.equal((await readPrestige(env,null,upstream,clock)).stale,false);
  const cached={...sample,generatedAt:new Date(clock+1000).toISOString()};
  assert.equal((await readPrestige(env,cached,upstream,clock+1000000)).generatedAt,cached.generatedAt);
  assert.equal((await readPrestige({},sample,upstream,clock+1000000)).stale,true);
  assert.equal(await readPrestige(env,null,()=>new Response(null,{status:401}),clock),null);
});
