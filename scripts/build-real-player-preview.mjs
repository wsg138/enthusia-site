import { readFile,writeFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { readPublicPlayerDirectory } from '../functions/lib/player-directory-source.js';
import {connectPublicGuilds} from './lib/public-player-guilds.mjs';
import {connectCompleteProfileCapture} from './lib/complete-profile-capture.mjs';
const file=process.argv[2];
const rendererVersion=createHash('sha256').update(await readFile('public/assets/exact-directory.js')).digest('hex').slice(0,12);
const rendererRevision=html=>html.replace('src="../assets/exact-directory.js"','src="../assets/exact-directory.js?local-profile='+rendererVersion+'"');
if(!file)throw new Error('Provide the privately captured public-board JSON file.');
const boards=JSON.parse(await readFile(file,'utf8'));
const bucket=value=>({get:async()=>({json:async()=>value})});
let data=await readPublicPlayerDirectory({PLAYTIME_LEADERBOARDS:bucket(boards.playtime),BALANCE_LEADERBOARDS:bucket(boards.balance)});
if(!data)throw new Error('No valid public player records were captured.');
if(process.argv[3]){
  const market=JSON.parse(await readFile(process.argv[3],'utf8'));
  const publicMarket={generatedAt:market.generatedAt,updatedAt:market.updatedAt,stalls:market.stalls.map(stall=>({
    id:stall.id,owner:{type:stall.owner?.type,uuid:stall.owner?.uuid??stall.owner?.id},
    shops:(stall.shops??[]).map(shop=>({direction:shop.direction}))
  }))};
  await writeFile('public/preview/real-player-market-data.json',JSON.stringify(publicMarket,null,2)+'\n');
}
if(process.argv[4]){
  const board=JSON.parse(await readFile(process.argv[4],'utf8'));
  const market=process.argv[3]?JSON.parse(await readFile(process.argv[3],'utf8')):null;
  const connected=connectPublicGuilds(data,board,market);data=connected.players;
  await writeFile('public/preview/real-player-guild-data.json',JSON.stringify(connected.guildDirectory,null,2)+'\n');
  let guildHtml=await readFile('public/guilds.html','utf8');
  guildHtml=guildHtml.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/').replaceAll('url(assets/','url(../assets/');
  guildHtml=guildHtml.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">\n<script src="./real-player-check.js"></script>');
  guildHtml=guildHtml.replace(/<body([^>]*)>/,'<body$1><aside style="padding:16px;background:#fff1ce;color:#491008">Captured real public guild leaderboard · Partial data · Local preview · Writes disabled</aside>');
  await writeFile('public/preview/real-player-guilds.html',rendererRevision(guildHtml));
}
let feeds={};
if(process.argv[5]){
  const raw=await readFile(process.argv[5],'utf8');if(Buffer.byteLength(raw)>2000000)throw new Error('Capture bundle is too large');
  const connected=connectCompleteProfileCapture(structuredClone(data),JSON.parse(raw));data=connected.players;feeds=connected.feeds;
  const guildFile='public/preview/real-player-guild-data.json';
  if(process.argv[4]){
    const directory=JSON.parse(await readFile(guildFile,'utf8')),byId=new Map(directory.items.map(row=>[row.id,row]));
    for(const player of data.items)for(const guild of player.guildMemberships??[]){
      byId.set(guild.id,{...(byId.get(guild.id)??{}),...guild});
    }
    directory.items=[...byId.values()];await writeFile(guildFile,JSON.stringify(directory,null,2)+'\n');
  }
}
await writeFile('public/preview/real-player-activity-data.json',JSON.stringify(feeds,null,2)+'\n');
await writeFile('public/preview/real-player-data.json',JSON.stringify(data,null,2)+'\n');
let html=await readFile('public/players.html','utf8');
html=html.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/')
  .replaceAll('url(assets/','url(../assets/');
html=html.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">\n<script src="./real-player-check.js"></script>');
html=html.replace(/<body([^>]*)>/,'<body$1>\n<aside style="padding:16px;background:#fff1ce;color:#491008;border-bottom:4px solid #491008">Captured real public profiles · Local preview · Writes disabled<br><a href="?profile=example#00000000-0000-4000-8000-000000000052">Profile layout example (simulated)</a> · <a href="?profile=real">Real captured profiles</a></aside>');
await writeFile('public/preview/real-player-check.html',rendererRevision(html));
for(const page of ['guildquests','bounties','achievements','index']){
  let related=await readFile('public/'+page+'.html','utf8');
  related=related.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/').replaceAll('url(assets/','url(../assets/');
  related=related.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">\n<script src="./real-player-check.js"></script>');
  related=related.replace(/<body([^>]*)>/,'<body$1><aside style="padding:16px;background:#fff1ce;color:#491008">Local captured-feed check · Missing feeds stay unavailable · Writes disabled</aside>');
  await writeFile('public/preview/real-player-'+(page==='index'?'warzone':page)+'.html',rendererRevision(related));
}
console.log('Built real player preview: '+data.items.length+' partial public profiles.');
