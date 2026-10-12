import { readFile,writeFile } from 'node:fs/promises';
import { readPublicPlayerDirectory } from '../functions/lib/player-directory-source.js';
import {connectPublicGuilds} from './lib/public-player-guilds.mjs';
const file=process.argv[2];
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
  await writeFile('public/preview/real-player-guilds.html',guildHtml);
}
await writeFile('public/preview/real-player-data.json',JSON.stringify(data,null,2)+'\n');
let html=await readFile('public/players.html','utf8');
html=html.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/')
  .replaceAll('url(assets/','url(../assets/');
html=html.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow">\n<script src="./real-player-check.js"></script>');
html=html.replace(/<body([^>]*)>/,'<body$1>\n<aside style="padding:16px;background:#fff1ce;color:#491008;border-bottom:4px solid #491008">Captured real public leaderboard profiles · Local preview · Writes disabled<br><a href="?profile=example#profile-contract-example">Guild layout example (simulated)</a> · <a href="?profile=real">Real captured profiles</a></aside>');
await writeFile('public/preview/real-player-check.html',html);
console.log('Built real player preview: '+data.items.length+' partial public profiles.');
