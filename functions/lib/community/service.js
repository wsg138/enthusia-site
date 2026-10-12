import { authenticateRequest } from '../auth.js';
import { getCompetitionIdentitySession } from '../competitions/identity.js';
import { requireSameOrigin } from '../security.js';
import { json } from '../responses.js';
import { onRequestGet as leaderboard } from '../../api/leaderboards/[[path]].js';
import { projectGuildDirectory } from '../guild-directory-source.js';
import { CONTENT_KINDS, SNAPSHOT_KINDS, identifier, validateRecord, decodeRow, publicRecord, projectSnapshot, validateSale, verifyProducer } from './contracts.js';

const unavailable=()=>json({error:'community_service_unavailable'},503);
async function identity(request,env){
  if(!env.COMPETITIONS_DB)return null;
  const s=await getCompetitionIdentitySession(request,env.COMPETITIONS_DB);
  if(!s?.discordGuildMember||!s.linkedMinecraftAccounts?.length)return null;
  return {id:s.discord.id};
}
async function editor(request,env){
  const s=await authenticateRequest(request,env);
  const roles=new Set(String(env.COMMUNITY_EDITOR_ROLES??'founder,admin').split(',').map(v=>v.trim()));
  if(!s.roles.some(role=>roles.has(role)))return null;
  return {id:s.player.uuid,name:s.player.name,rank:s.roles.includes('founder')?'Founder':s.roles.includes('admin')?'Admin':'Staff'};
}
async function body(request){
  if(Number(request.headers.get('content-length')??0)>150000)throw new Error('body_too_large');
  const reader=request.body?.getReader();if(!reader)throw new Error('missing_body');
  const chunks=[];let size=0;
  let finished=false;
  while(!finished){const {done,value}=await reader.read();finished=done;if(done)break;size+=value.byteLength;if(size>150000){await reader.cancel();throw new Error('body_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  return new TextDecoder().decode(bytes);
}
async function recordList(db,kind,staff){
  const rows=await db.prepare(`SELECT payload,revision,updated_at FROM community_records WHERE kind=? ${staff?'':"AND status='published'"} ORDER BY updated_at DESC LIMIT 200`).bind(kind).all();
  const items=rows.results.map(decodeRow).map(v=>staff?v:publicRecord(v)).filter(Boolean);
  if(kind==='news')items.sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned)));
  return json({items});
}
async function saveRecord(db,input,actor){
  const record={...validateRecord(input),authorName:actor.name??'Staff',authorRank:actor.rank??'Staff'},revision=input.revision??0;
  if(!Number.isInteger(revision)||revision<0)throw new Error('invalid_revision');
  const existing=decodeRow(await db.prepare('SELECT payload,revision,updated_at FROM community_records WHERE kind=? AND slug=?').bind(record.kind,record.slug).first());
  if(existing&&record.kind==='polls'&&JSON.stringify(existing.options)!==JSON.stringify(record.options)){
    const vote=await db.prepare('SELECT 1 AS voted FROM community_votes WHERE poll=? LIMIT 1').bind(record.slug).first();
    if(vote)return json({error:'poll_options_locked'},409);
  }
  const now=new Date().toISOString();
  // The revision predicate is evaluated within the transaction, including concurrent creators.
  const write=db.prepare(`INSERT INTO community_records(kind,slug,status,payload,revision,editor,updated_at)
    SELECT ?,?,?,?,?,?,? WHERE ?=0
    ON CONFLICT(kind,slug) DO UPDATE SET status=excluded.status,payload=excluded.payload,revision=community_records.revision+1,editor=excluded.editor,updated_at=excluded.updated_at WHERE community_records.revision=?`)
    .bind(record.kind,record.slug,record.status,JSON.stringify(record),1,actor.id,now,revision,revision);
  // For updates INSERT SELECT must emit a row; the separate UPDATE handles nonzero revision.
  const update=db.prepare(`UPDATE community_records SET status=?,payload=?,revision=revision+1,editor=?,updated_at=? WHERE kind=? AND slug=? AND revision=?
    AND (?<>'polls' OR json_extract(payload,'$.options')=? OR NOT EXISTS(SELECT 1 FROM community_votes WHERE poll=?))`)
    .bind(record.status,JSON.stringify(record),actor.id,now,record.kind,record.slug,revision,record.kind,JSON.stringify(record.options),record.slug);
  const audit=db.prepare(`INSERT INTO community_audit(actor,action,kind,slug,revision,occurred_at) SELECT ?,?,?,?,?,? WHERE changes()>0`)
    .bind(actor.id,record.status,record.kind,record.slug,revision+1,now);
  const result=await db.batch([revision===0?write:update,audit]);
  if(!result[0].meta.changes)return json({error:'revision_conflict'},409);
  return json({...record,revision:revision+1,updatedAt:now});
}
async function poll(db,slug,request,actor){
  const row=decodeRow(await db.prepare("SELECT payload,revision,updated_at FROM community_records WHERE kind='polls' AND slug=? AND status='published'").bind(slug).first());
  if(!row)return json({error:'not_found'},404);
  const now=new Date().toISOString();
  if(request.method==='POST'){
    const input=JSON.parse(await body(request));const choice=input.choice;
    if(!Number.isInteger(choice)||choice<0||choice>=row.options.length)return json({error:'invalid_choice'},400);
    const result=await db.prepare(`INSERT INTO community_votes(poll,voter,choice,updated_at)
      SELECT slug,?,?,? FROM community_records WHERE kind='polls' AND slug=? AND status='published' AND json_extract(payload,'$.closesAt')>?
      AND ?<json_array_length(json_extract(payload,'$.options')) AND revision=?
      ON CONFLICT(poll,voter) DO UPDATE SET choice=excluded.choice,updated_at=excluded.updated_at`)
      .bind(actor.id,choice,now,slug,now,choice,row.revision).run();
    if(!result.meta.changes)return json({error:'poll_closed_or_changed'},409);
  }
  const vote=actor?await db.prepare('SELECT choice FROM community_votes WHERE poll=? AND voter=?').bind(slug,actor.id).first():null;
  const totals=Date.parse(row.closesAt)<=Date.now()?(await db.prepare('SELECT choice,COUNT(*) AS votes FROM community_votes WHERE poll=? GROUP BY choice').bind(slug).all()).results:null;
  return json({poll:publicRecord(row),choice:vote?.choice??null,totals});
}
async function ingest(db,request,env){
  const raw=await body(request);
  if(!await verifyProducer(request,env,raw))return json({error:'invalid_producer_signature'},401);
  const input=JSON.parse(raw),now=new Date().toISOString(),nonce=request.headers.get('x-enthusia-nonce');
  const first=db.prepare('INSERT INTO community_nonces(nonce,occurred_at) VALUES (?,?)').bind(nonce,now);
  const cleanup=db.prepare('DELETE FROM community_nonces WHERE occurred_at<?').bind(new Date(Date.now()-86400000).toISOString());
  let statements;
  if(input.kind==='sales'){
    if(!Array.isArray(input.items)||input.items.length>250)throw new Error('invalid_sales_batch');
    const sales=input.items.map(v=>validateSale(v));
    const seen=new Map();for(const sale of sales){
      const stored=await db.prepare('SELECT id,stall,guild,item,quantity,gold,occurred_at AS occurredAt FROM market_sales WHERE id=?').bind(sale.id).first();
      const existing=stored??seen.get(sale.id);if(existing&&Object.keys(sale).some(key=>sale[key]!==existing[key]))throw new Error('invalid_sale_id_reuse');seen.set(sale.id,sale);
    }
    statements=sales.map(sale=>db.prepare('INSERT INTO market_sales(id,stall,guild,item,quantity,gold,occurred_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(sale.id,sale.stall,sale.guild,sale.item,sale.quantity,sale.gold,sale.occurredAt));
  }else{
    const snapshot=projectSnapshot(input.kind,input);
    statements=[db.prepare('INSERT INTO community_snapshots(kind,payload,updated_at) VALUES (?,?,?) ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(input.kind,JSON.stringify(snapshot),now)];
  }
  try{await db.batch([first,...statements,cleanup]);}catch(error){if(String(error).includes('UNIQUE'))return json({error:'producer_replay'},409);throw error;}
  return json({ok:true,received:input.items.length});
}
function weekRange(value){
  const date=value?new Date(value):new Date();if(!Number.isFinite(date.getTime()))throw new Error('invalid_week');
  date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  return [date.toISOString(),new Date(date.getTime()+7*86400000).toISOString()];
}
async function insights(db,url){
  const [start,end]=weekRange(url.searchParams.get('week'));
  const mode=url.searchParams.get('mode')==='guild'?'guild':'stall';
  const leaders=await db.prepare(`SELECT ${mode} AS name,SUM(gold) AS gold,SUM(quantity) AS quantity,COUNT(DISTINCT stall) AS stalls FROM market_sales WHERE occurred_at>=? AND occurred_at<? AND ${mode}<>'' GROUP BY ${mode} ORDER BY gold DESC,${mode} ASC LIMIT 50`).bind(start,end).all();
  const prices=await db.prepare(`SELECT item,SUM(gold)/SUM(quantity) AS price,SUM(quantity) AS quantity,COUNT(*) AS trades,MAX(occurred_at) AS lastSale FROM market_sales WHERE occurred_at>=? GROUP BY item ORDER BY trades DESC LIMIT 500`).bind(new Date(Date.now()-30*86400000).toISOString()).all();
  const previous=await db.prepare(`SELECT item,SUM(gold)/SUM(quantity) AS price FROM market_sales WHERE occurred_at>=? AND occurred_at<? GROUP BY item`).bind(new Date(Date.now()-60*86400000).toISOString(),new Date(Date.now()-30*86400000).toISOString()).all();
  const older=new Map(previous.results.map(v=>[v.item,v.price]));
  const history=await db.prepare(`SELECT substr(occurred_at,1,10) AS day,item,SUM(gold)/SUM(quantity) AS price,SUM(quantity) AS quantity FROM market_sales WHERE occurred_at>=? AND item=? GROUP BY day,item ORDER BY day`).bind(new Date(Date.now()-30*86400000).toISOString(),url.searchParams.get('item')??'').all();
  const weeks=await db.prepare("SELECT DISTINCT date(occurred_at,'weekday 0','-6 days') AS week FROM market_sales ORDER BY week DESC LIMIT 52").all();
  const recent=await db.prepare('SELECT MAX(occurred_at) AS updatedAt,COUNT(*) AS sales FROM market_sales').first();
  const hall=await db.prepare(`SELECT date(occurred_at,'weekday 0','-6 days') AS week,${mode} AS name,SUM(gold) AS gold FROM market_sales WHERE ${mode}<>'' GROUP BY week,${mode} ORDER BY week DESC,gold DESC,${mode} ASC LIMIT 1000`).all();
  const topWeeks=new Map();for(const row of hall.results){const rows=topWeeks.get(row.week)??[];if(rows.length<5)rows.push(row);topWeeks.set(row.week,rows);}
  const selected=start.slice(0,10);const streaks=new Map();for(const leader of leaders.results){let streak=0;for(let i=0;i<52;i++){const week=new Date(Date.parse(start)-i*7*86400000).toISOString().slice(0,10);if(!topWeeks.get(week)?.some(v=>v.name===leader.name))break;streak++;}streaks.set(leader.name,streak);}
  const stallTotals=await db.prepare('SELECT stall,SUM(gold) AS gold FROM market_sales WHERE occurred_at>=? AND occurred_at<? GROUP BY stall').bind(start,end).all();
  return json({week:start,mode,leaders:leaders.results.map(v=>({...v,streak:streaks.get(v.name)??0})),hallOfFame:[...topWeeks.entries()].filter(([week])=>week<=selected).map(([week,rows])=>({week,winner:rows[0]})),stallTotals:stallTotals.results,prices:prices.results.map(v=>({...v,change:older.has(v.item)?(v.price/older.get(v.item)-1)*100:null})),history:history.results,weeks:weeks.results.map(v=>v.week),updatedAt:recent.updatedAt,sales:recent.sales});
}
export async function handleCommunity(context,dependencies={editor,identity}){
  const {request,env,params}=context;const db=env.COMMUNITY_DB;
  const path=Array.isArray(params.path)?params.path.join('/'):String(params.path??'');
  const parts=path.split('/').filter(Boolean),url=new URL(request.url),method=request.method;
  if(!['GET','POST'].includes(method))return json({error:'method_not_allowed'},405,{allow:'GET, POST'});
  if(method==='POST'&&parts[0]!=='ingest'&&!requireSameOrigin(request))return json({error:'origin_required'},403);
  if(parts[0]==='guilds'&&parts.length===1&&method==='GET'){
    let snapshot=null;
    try{snapshot=db?await db.prepare("SELECT payload,updated_at FROM community_snapshots WHERE kind='guilds'").first():null;}catch{/* The existing leaderboard can operate without the new database. */}
    if(!snapshot){
      try{
        const response=await leaderboard({...context,params:{path:'guilds'}});
        if(!response.ok)return unavailable();const data=await response.json();
        if(!Array.isArray(data.entries))return unavailable();
        const projected=projectGuildDirectory(data);
        return json({...projected,updatedAt:data.generatedAt??null,limited:true,stale:data.generatedAt?Date.now()-Date.parse(data.generatedAt)>900000:true});
      }catch{return unavailable();}
    }
  }
  if(!db)return unavailable();
  try{
    if(parts.length===1&&parts[0]==='ingest'&&method==='POST')return await ingest(db,request,env);
    if(parts[0]==='admin'){
      let actor;try{actor=await dependencies.editor(request,env);}catch{return json({error:'authentication_required'},401);}
      if(!actor)return json({error:'editor_role_required'},403);
      if(parts[1]==='session'&&method==='GET')return json({editor:true,name:actor.name??'Staff',rank:actor.rank??'Staff'});
      if(CONTENT_KINDS.has(parts[1])&&parts.length===2){
        if(method==='GET')return await recordList(db,parts[1],true);
        const input=JSON.parse(await body(request));if(input.kind!==parts[1])return json({error:'invalid_kind'},400);
        return await saveRecord(db,input,actor);
      }
    }
    if(parts[0]==='polls'&&parts.length===2){
      const slug=identifier(parts[1]);let actor=null;try{actor=await dependencies.identity(request,env);}catch{/* Signed out viewing is allowed. */}
      if(method==='POST'&&!actor)return json({error:'linked_account_required'},401);
      return await poll(db,slug,request,actor);
    }
    if(parts[0]==='alerts'&&parts.length===1){
      let actor=null;try{actor=await dependencies.identity(request,env);}catch{/* Linked-account access fails closed. */}
      if(!actor)return json({error:'linked_account_required'},401);
      if(method==='GET')return json({items:(await db.prepare('SELECT item,threshold,last_sent_at AS lastSentAt FROM market_alerts WHERE subscriber=?').bind(actor.id).all()).results});
      const input=JSON.parse(await body(request)),item=identifier(input.item);
      if(input.remove===true){await db.prepare('DELETE FROM market_alerts WHERE subscriber=? AND item=?').bind(actor.id,item).run();return json({ok:true});}
      if(!Number.isFinite(input.threshold)||input.threshold<=0||input.threshold>1e12)return json({error:'invalid_threshold'},400);
      const saved=await db.prepare(`INSERT INTO market_alerts(subscriber,item,threshold,updated_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM market_alerts WHERE subscriber=?)<20 OR EXISTS(SELECT 1 FROM market_alerts WHERE subscriber=? AND item=?)
        ON CONFLICT(subscriber,item) DO UPDATE SET threshold=excluded.threshold,updated_at=excluded.updated_at`).bind(actor.id,item,input.threshold,new Date().toISOString(),actor.id,actor.id,item).run();
      if(!saved.meta.changes)return json({error:'alert_limit_reached'},409);
      return json({ok:true});
    }
    if(parts[0]==='insights'&&method==='GET')return await insights(db,url);
    if(SNAPSHOT_KINDS.has(parts[0])&&parts.length===1&&method==='GET'){
      const row=await db.prepare('SELECT payload,updated_at FROM community_snapshots WHERE kind=?').bind(parts[0]).first();
      if(!row){if(parts[0]==='achievements'){const response=await recordList(db,'achievements',false);const data=await response.json();return json({...data,curated:true});}return unavailable();}
      return json({...projectSnapshot(parts[0],JSON.parse(row.payload)),updatedAt:row.updated_at,stale:Date.now()-Date.parse(row.updated_at)>900000});
    }
    if(CONTENT_KINDS.has(parts[0])&&parts.length===1&&method==='GET')return await recordList(db,parts[0],false);
    return json({error:'not_found'},404);
  }catch(error){
    if(error instanceof SyntaxError)return json({error:'invalid_json'},400);
    if(/^(invalid_|missing_|body_too_large|duplicate_)/.test(error.message))return json({error:error.message},400);
    return unavailable();
  }
}
