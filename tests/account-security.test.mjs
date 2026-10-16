import assert from 'node:assert/strict';
import test from 'node:test';
import {d1,migratedDatabase} from './support/d1-sqlite.mjs';
import {createOAuthState,createIdentitySession,getCompetitionIdentitySession} from '../functions/lib/competitions/identity.js';
import {onRequestGet as start} from '../functions/api/competitions/auth/discord/start.js';
import {onRequestGet as callback} from '../functions/api/competitions/auth/discord/callback.js';
import {onRequestPost as logoutAll,onRequest as logoutAllMethod} from '../functions/api/competitions/auth/logout-all.js';
import {onRequestPost as logout} from '../functions/api/competitions/auth/logout.js';
import {onRequest as apiHeaders} from '../functions/api/_middleware.js';
import {buildDiscordStaffSession,authenticateRequest} from '../functions/lib/auth.js';

const origin='https://preview.example',id='100000000000000001';
const settings={COMPETITIONS_ENABLED:'true',DISCORD_CLIENT_ID:id,DISCORD_CLIENT_SECRET:'test-only-oauth-secret',
  DISCORD_GUILD_ID:'100000000000000002',DISCORD_OAUTH_REDIRECT_URI:origin+'/api/competitions/auth/discord/callback'};
async function withDiscord(work) {
  const previous=globalThis.fetch;let calls=0;
  globalThis.fetch=async url=>{
    calls++;
    if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'synthetic-access'});
    if(String(url).endsWith('/users/@me'))return Response.json({id,username:'Synthetic'});
    return Response.json({roles:[]});
  };
  try{return await work(()=>calls);}finally{globalThis.fetch=previous;}
}
test('a callback from a browser that never started login cannot create an account session',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const {state}=await createOAuthState(db,'/account.html');
    await withDiscord(async calls=>{
      const response=await callback({env:{...settings,COMPETITIONS_DB:db},request:new Request(
        origin+'/api/competitions/auth/discord/callback?code=synthetic-code&state='+state)});
      assert.doesNotMatch(response.headers.get('set-cookie')??'',/__Host-enthusia_competition_session=/);
      assert.equal(calls(),0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions').get().count,0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_oauth_states').get().count,1);
    });
  }finally{database.close();}
});
test('refreshing Discord roles does not extend an eight-hour staff login',()=>{
  const now=Date.now(),role='100000000000000003';
  const identity={discordGuildMember:true,guildRoleIds:[role],discordRolesCheckedAt:new Date(now).toISOString(),
    authenticatedAt:new Date(now-9*3600000).toISOString(),
    linkedMinecraftAccounts:[{uuid:'10000000-0000-4000-8000-000000000001',name:'Founder'}]};
  assert.throws(()=>buildDiscordStaffSession(identity,{DISCORD_FOUNDER_ROLE_IDS:role},now),/sign in again/i);
});
test('staff login limits reject missing, future and expired dates but preserve ordinary player sessions',async()=>{
  const database=await migratedDatabase(),db=d1(database),now=Date.now(),role='100000000000000003';
  const base={discordGuildMember:true,guildRoleIds:[role],discordRolesCheckedAt:new Date(now).toISOString(),
    linkedMinecraftAccounts:[{uuid:'10000000-0000-4000-8000-000000000001',name:'Founder'}]};
  for(const date of [null,'invalid',new Date(now+6*60000).toISOString(),new Date(now-8*3600000).toISOString()])
    assert.throws(()=>buildDiscordStaffSession({...base,authenticatedAt:date},{DISCORD_FOUNDER_ROLE_IDS:role},now),/sign in again/i);
  assert.deepEqual(buildDiscordStaffSession({...base,authenticatedAt:new Date(now-7*3600000).toISOString()},
    {DISCORD_FOUNDER_ROLE_IDS:role},now).roles,['founder']);
  try {
    const identity=await createIdentitySession(db,{id,username:'Founder',guildMember:true,roleIds:[role]},new Date(now-9*3600000));
    database.prepare('UPDATE competition_discord_accounts SET updated_at=? WHERE discord_user_id=?').run(new Date(now).toISOString(),id);
    const request=new Request(origin+'/api/competitions/admin/status',{headers:{cookie:sessionCookie(identity.token)}});
    assert.ok(await getCompetitionIdentitySession(request,db));
    await assert.rejects(authenticateRequest(request,{COMPETITIONS_DB:db,DISCORD_FOUNDER_ROLE_IDS:role},
      async()=>{throw new Error('No Access fallback');}),/sign in again/i);
  }finally{database.close();}
});

function context(db,path,cookie='',method='GET',headers={}) {
  return {env:{...settings,COMPETITIONS_DB:db},request:new Request(origin+path,
    {method,headers:{cookie,...headers}})};
}
function sessionCookie(token){return '__Host-enthusia_competition_session='+token;}
async function loginStart(db) {
  const response=await start(context(db,'/api/competitions/auth/discord/start?returnTo=%2Faccount.html'));
  assert.equal(response.status,302);
  return {response,state:new URL(response.headers.get('location')).searchParams.get('state'),
    cookie:response.headers.get('set-cookie').split(';')[0]};
}
test('OAuth start binds a short-lived secure browser cookie and authentic callbacks cannot replay',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const begun=await loginStart(db);
    assert.match(begun.cookie,/^__Host-enthusia_oauth_state=[A-Za-z0-9_-]{43}$/);
    assert.match(begun.response.headers.get('set-cookie'),/Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
    assert.equal(begun.response.headers.get('cache-control'),'no-store');
    const path='/api/competitions/auth/discord/callback?code=synthetic-code&state='+begun.state;
    await withDiscord(async calls=>{
      const completed=await callback(context(db,path,begun.cookie));
      assert.equal(completed.headers.get('location'),origin+'/account.html');
      assert.equal(completed.headers.getSetCookie().length,2);
      assert.match(completed.headers.getSetCookie()[0],/__Host-enthusia_competition_session=/);
      assert.match(completed.headers.getSetCookie()[1],/oauth_state=;.*Max-Age=0/);
      assert.equal(calls(),3);
      const replay=await callback(context(db,path,begun.cookie));
      assert.doesNotMatch(replay.headers.get('set-cookie')??'',/__Host-enthusia_competition_session=/);
      assert.equal(calls(),3);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions').get().count,1);
    });
  }finally{database.close();}
});
test('mismatched or duplicated browser cookies do not consume another browser login',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const begun=await loginStart(db),path='/api/competitions/auth/discord/callback?code=test&state='+begun.state;
    for(const cookie of ['__Host-enthusia_oauth_state='+'x'.repeat(43),begun.cookie+'; '+begun.cookie]){
      await withDiscord(async calls=>{
        const result=await callback(context(db,path,cookie));
        assert.equal(new URL(result.headers.get('location')).searchParams.get('auth'),'failed');
        assert.equal(calls(),0);
      });
    }
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_oauth_states').get().count,1);
  }finally{database.close();}
});
test('expired and cancelled OAuth attempts cannot mint sessions',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const {state}=await createOAuthState(db,'/account.html',new Date(Date.now()-11*60000));
    await withDiscord(async calls=>{
      const expired=await callback(context(db,'/api/competitions/auth/discord/callback?code=test&state='+state,'__Host-enthusia_oauth_state='+state));
      assert.match(expired.headers.get('set-cookie'),/oauth_state=;.*Max-Age=0/);
      const begun=await loginStart(db);
      const cancelled=await callback(context(db,'/api/competitions/auth/discord/callback?error=access_denied&state='+begun.state,begun.cookie));
      assert.equal(new URL(cancelled.headers.get('location')).searchParams.get('auth'),'cancelled');
      assert.equal(calls(),0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions').get().count,0);
    });
  }finally{database.close();}
});
test('OAuth start throttles repeated attempts without creating more login transactions',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    for(let i=0;i<30;i++)assert.equal((await start(context(db,'/api/competitions/auth/discord/start'))).status,302);
    const limited=await start(context(db,'/api/competitions/auth/discord/start'));
    assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_oauth_states').get().count,30);
  }finally{database.close();}
});
test('logout-all revokes only the authenticated owner, works without network accounts, and preserves links',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const first=await createIdentitySession(db,{id,username:'Owner'});
    await createIdentitySession(db,{id,username:'Owner'});
    const otherId='100000000000000099',other=await createIdentitySession(db,{id:otherId,username:'Other'});
    database.prepare(`INSERT INTO competition_minecraft_links
      (minecraft_uuid,discord_user_id,minecraft_name,linked_at,updated_at) VALUES (?,?,?,?,?)`)
      .run('10000000-0000-4000-8000-000000000001',id,'Owner',new Date().toISOString(),new Date().toISOString());
    const request=context(db,'/api/competitions/auth/logout-all',sessionCookie(first.token),'POST',{origin});
    request.env.NETWORK_ACCOUNT_LINKS='true'; // No upstream configured: emergency revocation must not depend on it.
    const result=await logoutAll(request);
    assert.equal(result.status,200);assert.match(result.headers.get('set-cookie'),/Max-Age=0/);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions WHERE discord_user_id=?').get(id).count,0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions WHERE discord_user_id=?').get(otherId).count,1);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_minecraft_links').get().count,1);
    assert.equal((await getCompetitionIdentitySession(context(db,'/',sessionCookie(other.token)).request,db)).discord.id,otherId);
    assert.equal((await logoutAll(request)).status,401);
  }finally{database.close();}
});
test('logout-all rejects cross-origin, missing-origin, absent and expired sessions',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const old=await createIdentitySession(db,{id,username:'Owner'},new Date(Date.now()-31*86400000));
    const fresh=await createIdentitySession(db,{id,username:'Owner'});
    for(const badOrigin of ['', 'https://other.example'])
      assert.equal((await logoutAll(context(db,'/api/competitions/auth/logout-all',sessionCookie(fresh.token),'POST',{origin:badOrigin}))).status,403);
    for(const cookie of ['',sessionCookie(old.token)])
      assert.equal((await logoutAll(context(db,'/api/competitions/auth/logout-all',cookie,'POST',{origin}))).status,401);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions').get().count,2);
    assert.equal(logoutAllMethod().status,405);
  }finally{database.close();}
});
test('current-device logout leaves another session valid, and database outages never report successful revocation',async()=>{
  const database=await migratedDatabase(),db=d1(database);
  try {
    const first=await createIdentitySession(db,{id,username:'Owner'});
    await createIdentitySession(db,{id,username:'Owner'});
    assert.equal((await logout(context(db,'/api/competitions/auth/logout',sessionCookie(first.token),'POST',{origin}))).status,200);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM competition_identity_sessions').get().count,1);
  }finally{database.close();}
  const broken={prepare(){throw new Error('Private database detail');}};
  for(const handler of [logout,logoutAll]){
    const result=await handler(context(broken,'/api/competitions/auth/logout',sessionCookie('test'),'POST',{origin}));
    assert.equal(result.status,503);assert.equal(result.headers.has('set-cookie'),false);
    assert.equal(JSON.stringify(await result.json()).includes('Private'),false);
  }
});
test('API middleware secures JSON, errors, redirects and media without losing cookies, body or caching',async()=>{
  const redirects=new Response(null,{status:303,headers:{location:'/account','cache-control':'public, max-age=60'}});
  redirects.headers.append('set-cookie','one=1; Secure; HttpOnly');redirects.headers.append('set-cookie','two=2; Secure; HttpOnly');
  const redirected=await apiHeaders({request:new Request(origin+'/api/competitions/auth/discord/callback'),next:async()=>redirects});
  assert.equal(redirected.status,303);assert.equal(redirected.headers.get('location'),'/account');
  assert.deepEqual(redirected.headers.getSetCookie(),redirects.headers.getSetCookie());
  assert.equal(redirected.headers.get('cache-control'),'no-store');
  const streamed=new Response('event: ready\n\n',{headers:{'content-type':'text/event-stream','cache-control':'public, max-age=20'}});
  const response=await apiHeaders({request:new Request(origin+'/api/market'),next:async()=>streamed});
  assert.equal(await response.text(),'event: ready\n\n');assert.equal(response.headers.get('cache-control'),'public, max-age=20');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('x-frame-options'),'DENY');
  assert.match(response.headers.get('strict-transport-security'),/includeSubDomains/);
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  const error=await apiHeaders({request:new Request(origin+'/api/private'),next:async()=>{throw new Error('private credential');}});
  assert.equal(error.status,500);assert.deepEqual(await error.json(),{error:'internal_error'});
  assert.equal(error.headers.get('referrer-policy'),'no-referrer');
});
