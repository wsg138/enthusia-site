import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { projectSnapshot,validateSale } from '../functions/lib/community/contracts.js';

// Explicit operator invocation only. Never called by tests/builds or scheduled locally.
const [file,site]=process.argv.slice(2);
if(!file||!site)throw new Error('Usage: node scripts/publish-community-export.mjs export.json https://your-reviewed-site');
const url=new URL('/api/community/ingest',site);
if(url.protocol!=='https:'||url.username||url.password)throw new Error('An HTTPS site origin is required.');
const secret=process.env.COMMUNITY_INGEST_SECRET;
if(!secret||secret.length<32)throw new Error('Set COMMUNITY_INGEST_SECRET for this explicit publish invocation.');
let input=JSON.parse(await readFile(file,'utf8'));
if(input.kind==='sales'){
  if(!Array.isArray(input.items)||input.items.length>250)throw new Error('Sales batches must contain at most 250 events.');
  input.items=input.items.map(item=>validateSale(item));
}else input={kind:input.kind,...projectSnapshot(input.kind,input)};
const body=JSON.stringify(input);if(new TextEncoder().encode(body).length>150000)throw new Error('Export exceeds the request size limit.');
const timestamp=String(Date.now()),nonce=randomBytes(16).toString('hex'),encoder=new TextEncoder();
const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${timestamp}\n${nonce}\n${url.pathname}\n${body}`)))].map(value=>value.toString(16).padStart(2,'0')).join('');
const response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-enthusia-timestamp':timestamp,'x-enthusia-nonce':nonce,'x-enthusia-signature':signature},body});
if(!response.ok)throw new Error('Export was rejected (HTTP '+response.status+').');
console.log('Export accepted: '+input.kind+', '+input.items.length+' public records.');
