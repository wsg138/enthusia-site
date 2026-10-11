export const CONTENT_KINDS = new Set(['news','changelog','roadmap','timeline','halloffame','creators','museum','achievements','polls']);
export const SNAPSHOT_KINDS = new Set(['guilds','players','bounties','achievements']);
export function text(value, max=200, required=false) {
  if (value === undefined || value === null) { if(required) throw new Error('missing_text'); return ''; }
  if(typeof value !== 'string' || value.length>max || (required&&!value.trim())) throw new Error('invalid_text');
  return value.trim();
}
export function identifier(value) {
  const id=text(value,80,true);
  if(!/^[A-Za-z0-9_.:-]+$/.test(id))throw new Error('invalid_identifier');
  return id;
}
export function publicUrl(value) {
  if(!value)return '';
  const input=text(value,500,true);
  if(input.startsWith('/assets/')&&!input.includes('..'))return input;
  const url=new URL(input);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('invalid_url');
  return url.href;
}
function number(value, max=1e12) {
  if(value===undefined||value===null)return null;
  if(!Number.isFinite(value)||value<0||value>max)throw new Error('invalid_number');
  return value;
}
function timestamp(value) {
  if(!value)return null;
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('invalid_date');
  return new Date(value).toISOString();
}
export function validateRecord(input) {
  if(!input||!CONTENT_KINDS.has(input.kind))throw new Error('invalid_kind');
  const options=Array.isArray(input.options)?input.options.map(v=>text(v,160,true)):[];
  const closesAt=timestamp(input.closesAt);
  if(input.kind==='polls'&&(options.length<2||options.length>8||new Set(options).size!==options.length||!closesAt))throw new Error('invalid_poll');
  const status=input.status??'draft';
  if(!['draft','published','archived'].includes(status))throw new Error('invalid_status');
  const verification=input.verification??'unverified';
  if(!['verified','unverified'].includes(verification))throw new Error('invalid_verification');
  return {kind:input.kind,slug:identifier(input.slug),title:text(input.title,160,true),body:text(input.body,20000),category:text(input.category,80),date:timestamp(input.date),image:publicUrl(input.image),target:publicUrl(input.target),tags:Array.isArray(input.tags)?input.tags.slice(0,12).map(v=>text(v,40,true)):[],status,verification,options,closesAt};
}
export function decodeRow(row) {
  return row?{...JSON.parse(row.payload),revision:row.revision,updatedAt:row.updated_at}:null;
}
export function publicRecord(row) {
  if(!row||row.status!=='published')return null;
  const safe={};
  for(const key of ['kind','slug','title','body','category','date','image','target','tags','verification','options','closesAt','revision','updatedAt'])if(row[key]!==undefined)safe[key]=row[key];
  return safe;
}
function links(input) {return Array.isArray(input)?input.slice(0,8).map(v=>({label:text(v.label,80,true),url:publicUrl(v.url)})):[];}
function memberNames(input){return Array.isArray(input)?input.slice(0,200).map(v=>text(v,40,true)):[];}
export function projectSnapshot(kind,input) {
  if(!SNAPSHOT_KINDS.has(kind)||!Array.isArray(input?.items)||input.items.length>1000)throw new Error('invalid_snapshot');
  const ids=new Set();
  const items=input.items.map(row=>{
    const id=identifier(row.id);if(ids.has(id))throw new Error('duplicate_id');ids.add(id);
    const base={id,name:text(row.name,80,true),description:text(row.description,2000)};
    if(kind==='guilds')return {...base,level:number(row.level),members:number(row.members,20000),elo:number(row.elo),recruiting:typeof row.recruiting==='boolean'?row.recruiting:null,peaceful:typeof row.peaceful==='boolean'?row.peaceful:null,membersList:memberNames(row.membersList),links:links(row.links)};
    if(kind==='players')return {...base,guild:text(row.guild,80),rank:text(row.rank,80),playtime:number(row.playtime),balance:number(row.balance),reputation:number(row.reputation),achievements:memberNames(row.achievements),links:links(row.links)};
    if(kind==='bounties')return {...base,gold:number(row.gold),state:['open','claimed','expired'].includes(row.state)?row.state:'open',hunter:text(row.hunter,80),expiresAt:timestamp(row.expiresAt)};
    return {...base,category:text(row.category,80),reward:text(row.reward,200),completed:number(row.completed,1e8)};
  });
  return {schemaVersion:1,items};
}
export function pollOpen(record,now=Date.now()) {return record?.status==='published'&&Number.isFinite(Date.parse(record.closesAt))&&Date.parse(record.closesAt)>now;}
export function validateSale(input,now=Date.now()) {
  const occurredAt=timestamp(input.occurredAt);
  const quantity=number(input.quantity,1e9),gold=number(input.gold,1e12);
  if(!occurredAt||Date.parse(occurredAt)>now+60000||!quantity||!gold)throw new Error('invalid_sale');
  return {id:identifier(input.id),stall:text(input.stall,80,true),guild:text(input.guild,80),item:identifier(input.item),quantity,gold,occurredAt};
}
export async function verifyProducer(request,env,body,now=Date.now()) {
  if(typeof env.COMMUNITY_INGEST_SECRET!=='string'||env.COMMUNITY_INGEST_SECRET.length<32)return false;
  const time=request.headers.get('x-enthusia-timestamp'),nonce=request.headers.get('x-enthusia-nonce'),signature=request.headers.get('x-enthusia-signature');
  if(!/^\d{13}$/.test(time??'')||Math.abs(now-Number(time))>300000||!/^[A-Za-z0-9_-]{16,80}$/.test(nonce??'')||!/^[a-f0-9]{64}$/.test(signature??''))return false;
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.COMMUNITY_INGEST_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=Uint8Array.from(signature.match(/../g),v=>parseInt(v,16));
  return crypto.subtle.verify('HMAC',key,bytes,encoder.encode(`${time}\n${nonce}\n${new URL(request.url).pathname}\n${body}`));
}
