import assert from 'node:assert/strict';
import test from 'node:test';
import {authenticateRequest} from '../functions/lib/auth.js';
import {createIdentitySession} from '../functions/lib/competitions/identity.js';
import {d1,migratedDatabase} from './support/d1-sqlite.mjs';

const user='100000000000000001',guild='100000000000000002',role='100000000000000003';
function fixture({fresh=false,linked=true,changes=1}={}) {
  const writes=[];
  const env={DISCORD_GUILD_ID:guild,DISCORD_FOUNDER_ROLE_IDS:role,ENTHUSIA_SITE_DISCORD_BOT_TOKEN:'t'.repeat(60)};
  env.COMPETITIONS_DB={prepare(sql){return {bind(...values){return {
    async first(){return sql.includes('FROM competition_identity_sessions')?{
      discordUserId:user,expiresAt:new Date(Date.now()+3600000).toISOString(),username:'Founder',authenticatedAt:new Date().toISOString(),
      guildRoleIdsJson:JSON.stringify({member:true,roleIds:[role]}),
      discordRolesCheckedAt:new Date(Date.now()-(fresh?0:7200000)).toISOString()}:null;},
    async all(){return {results:linked?[{uuid:'10000000-0000-4000-8000-000000000001',name:'Founder'}]:[]};},
    async run(){if(sql.includes('UPDATE competition_discord_accounts'))writes.push({sql,values});return {meta:{changes}};}
  };}};}};
  const request=new Request('https://preview.example/api/competitions/admin/status',{
    headers:{cookie:'__Host-enthusia_competition_session=synthetic-session'}});
  return {env,writes,authenticate:()=>authenticateRequest(request,env,async()=>{throw new Error('No Access fallback');})};
}
async function withFetch(fetcher,work) {
  const previous=globalThis.fetch;globalThis.fetch=fetcher;
  try{return await work();}finally{globalThis.fetch=previous;}
}
function member(roles=[role],id=user){return Response.json({user:{id},roles});}

test('stale founder roles refresh from Discord before staff authorization',async()=>{
  const context=fixture();let calls=0;
  await withFetch(async(url,options)=>{
    calls++;assert.equal(url,`https://discord.com/api/v10/guilds/${guild}/members/${user}`);
    assert.equal(options.headers.authorization,`Bot ${context.env.ENTHUSIA_SITE_DISCORD_BOT_TOKEN}`);
    assert.equal(options.redirect,'error');assert.ok(options.signal);
    return member();
  },async()=>{
    const session=await context.authenticate();assert.deepEqual(session.roles,['founder']);
    assert.ok(Date.now()-Date.parse(session.discordRolesCheckedAt)<10000);
  });
  assert.equal(calls,1);assert.equal(context.writes.length,1);
  assert.deepEqual(JSON.parse(context.writes[0].values[0]),{member:true,roleIds:[role]});
  assert.equal(context.writes[0].values[2],user);
});
test('fresh staff roles do not trigger another Discord call',async()=>{
  const context=fixture({fresh:true});
  await withFetch(async()=>{assert.fail('Unexpected Discord request');},async()=>{
    assert.deepEqual((await context.authenticate()).roles,['founder']);
  });assert.equal(context.writes.length,0);
});
for(const [name,fetcher] of [
  ['removed staff role',async()=>member([])],
  ['departed guild member',async()=>new Response('',{status:404})],
  ['Discord outage',async()=>new Response('',{status:503})],
  ['rate limit',async()=>new Response('',{status:429})],
  ['wrong user',async()=>member([role],'100000000000000099')],
  ['invalid role response',async()=>Response.json({user:{id:user},roles:['founder']})],
  ['network failure',async()=>{throw new Error('Network unavailable');}]
])test(`stale privileges are rejected after ${name}`,async()=>{
  const context=fixture();
  await withFetch(fetcher,()=>assert.rejects(context.authenticate()));
});
test('an authoritative refresh cannot bypass missing Minecraft ownership or an account write conflict',async()=>{
  for(const options of [{linked:false},{changes:0}]){
    const context=fixture(options);
    await withFetch(async()=>member(),()=>assert.rejects(context.authenticate()));
  }
});
test('missing website bot credentials do not extend cached privileges',async()=>{
  const context=fixture();delete context.env.ENTHUSIA_SITE_DISCORD_BOT_TOKEN;
  await withFetch(async()=>{assert.fail('Unexpected Discord request');},()=>assert.rejects(context.authenticate()));
  assert.equal(context.writes.length,0);
});
test('a stalled Discord lookup is aborted without extending cached privileges',async()=>{
  const context=fixture();let aborted=false;
  await withFetch((_url,options)=>new Promise((_resolve,reject)=>{
    options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('Aborted'));},{once:true});
  }),()=>assert.rejects(context.authenticate()));
  assert.equal(aborted,true);assert.equal(context.writes.length,0);
});
test('native SQLite persists the refreshed membership for the next authenticated request',async()=>{
  const database=await migratedDatabase(),db=d1(database),old=new Date(Date.now()-7200000);
  try {
    const identity=await createIdentitySession(db,{id:user,username:'Founder',guildMember:true,roleIds:[role]},old);
    database.prepare(`INSERT INTO competition_minecraft_links
      (minecraft_uuid,discord_user_id,minecraft_name,linked_at,updated_at) VALUES (?,?,?,?,?)`)
      .run('10000000-0000-4000-8000-000000000001',user,'Founder',old.toISOString(),old.toISOString());
    const env={...fixture().env,COMPETITIONS_DB:db};
    const request=new Request('https://preview.example/api/competitions/admin/status',{
      headers:{cookie:`__Host-enthusia_competition_session=${identity.token}`}});
    let calls=0;
    await withFetch(async()=>{calls++;return member();},async()=>{
      assert.deepEqual((await authenticateRequest(request,env)).roles,['founder']);
      assert.deepEqual((await authenticateRequest(request,env)).roles,['founder']);
    });
    assert.equal(calls,1);
    const persisted=database.prepare('SELECT updated_at,guild_role_ids_json FROM competition_discord_accounts WHERE discord_user_id=?').get(user);
    assert.ok(Date.parse(persisted.updated_at)>old.getTime());
    assert.deepEqual(JSON.parse(persisted.guild_role_ids_json),{member:true,roleIds:[role]});
  } finally {database.close();}
});
