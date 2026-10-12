import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {enrichGuildBanners,publicMarketBanners} from '../functions/lib/guild-banner-source.js';
import {onRequestGet} from '../functions/api/leaderboards/[[path]].js';
const id='83b21e82-6c27-4bfe-88fa-da090dcb6ef4',other='724e5531-f6e4-4423-9c38-d4a7bec10973';
const design={baseColor:'BLACK',patterns:[{type:'TRIANGLE_BOTTOM',color:'BLUE'}]};
const owner=(value=id,banner=design)=>({owner:{type:'GUILD',id:value,name:'WOT',avatar:{kind:'GUILD_BANNER',banner}}});
test('real market banners join by guild UUID, preserve rankings, and project only public banner fields',()=>{
  const rankings={entries:[{id,name:'WeOnTop',rank:2,level:100},{id:other,name:'WOT',rank:5}]};
  const result=enrichGuildBanners(rankings,{stalls:[owner(id,{...design,secret:'private'})]});
  assert.deepEqual(result.entries[0],{...rankings.entries[0],banner:design});assert.equal(result.entries[1].banner,undefined);assert.equal(rankings.entries[0].banner,undefined);
});
test('guild-owned player heads, invalid banners, and conflicting designs cannot stand in for a guild banner',()=>{
  const rankings={entries:[{id,name:'WOT'}]};
  for(const stalls of [[{owner:{...owner().owner,avatar:{kind:'MINECRAFT_HEAD',url:'https://example.com/player'}}}],[owner(id,{baseColor:'INVALID',patterns:[]})],[owner(),owner(id,{baseColor:'RED',patterns:[]})]])assert.equal(enrichGuildBanners(rankings,{stalls}).entries[0].banner,undefined);
  assert.deepEqual(enrichGuildBanners(rankings,{stalls:[owner(),owner()]}).entries[0].banner,design);
});
test('direct guild designs take precedence over market copies and UUID formatting is normalized',()=>{
  const direct={baseColor:'WHITE',patterns:[]};
  const result=enrichGuildBanners({entries:[{id:id.toUpperCase().replaceAll('-',''),banner:direct}]},{stalls:[owner()]});assert.deepEqual(result.entries[0].banner,direct);
});
test('optional market failure retains guild rankings and its request carries no guild credentials',async()=>{
  const rankings={entries:[{id,name:'WOT'}]};
  for(const fetcher of [async()=>{throw Error('offline');},async()=>new Response('',{status:503}),async()=>new Response('invalid JSON')])assert.equal(await publicMarketBanners(rankings,fetcher),rankings);
  const result=await publicMarketBanners(rankings,async(url,options)=>{assert.equal(url,'https://market-api.enthusia.info/v1/market');assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');return Response.json({stalls:[owner()]});});assert.deepEqual(result.entries[0].banner,design);
});
test('guild podium without a banner renders a neutral banner, never a member skin',()=>{
  const source=readFileSync(new URL('../public/assets/page-leaderboards.js',import.meta.url),'utf8');
  const start=source.indexOf('  function podiumVisual('),end=source.indexOf('  function podiumPlace(');
  const visual=runInNewContext(source.slice(start,end)+';podiumVisual',{entryVisual:entry=>({kind:'guild-banner',name:entry.name}),el:()=>{throw Error('Player skin must not render for a guild');}});
  const result=visual({isGuild:true,name:'WeOnTop',headId:'a-member-uuid'});assert.equal(result.kind,'guild-banner');
});
test('guild proxy enriches public banners without forwarding private upstream authentication',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),headers:options.headers});return calls.length===1?Response.json({entries:[{id,name:'WOT',rank:2,level:100}]}):Response.json({stalls:[owner()]});};
  try{const response=await onRequestGet({params:{path:'guilds'},env:{GUILDS_API_URL:'https://guild.example/api',GUILDS_API_BEARER:'test-only',CF_ACCESS_CLIENT_ID:'test-id',CF_ACCESS_CLIENT_SECRET:'test-secret'}});assert.equal(response.status,200);assert.deepEqual((await response.json()).entries[0].banner,design);assert.equal(calls.length,2);assert.deepEqual(calls[1].headers,{Accept:'application/json'});}finally{globalThis.fetch=original;}
});
