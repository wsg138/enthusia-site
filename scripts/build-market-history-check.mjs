// Generate a local interactive contract check from actual HTML and SQLite queries.
import {readFile,writeFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {handleCommunity} from '../functions/lib/community/service.js';
const sql=new DatabaseSync(':memory:');
sql.exec(await readFile(new URL('../migrations/community/0001_community.sql',import.meta.url),'utf8'));
const now=Date.now(),insert=sql.prepare('INSERT INTO market_sales VALUES(?,?,?,?,?,?,?)');
for(const [item,oldPrice,newPrice]of [['diamond',12,14],['emerald',6,4]]){
  for(const days of [55,50,35,25,20,10,2]){
    const quantity=3,price=days>30?oldPrice:newPrice;
    insert.run(item+'-'+days,'','',item,quantity,price*quantity,new Date(now-days*86400000).toISOString());
  }
}
const db={prepare(query){let args=[];return {bind(...values){args=values;return this;},
  async first(){return sql.prepare(query).get(...args)??null;},
  async all(){return {results:sql.prepare(query).all(...args)};}};}};
const data={};
for(const item of ['', 'diamond','emerald']){
  const request=new Request('https://site.example/api/community/insights?item='+item);
  const response=await handleCommunity({request,params:{path:'insights'},env:{COMMUNITY_DB:db}});
  if(response.status!==200)throw new Error('Contract build failed');
  data[item]=await response.json();
}
sql.close();
await writeFile('public/preview/market-history-check-data.json',JSON.stringify(data,null,2)+'\n');
let html=await readFile('public/market.html','utf8');
html=html.replaceAll('href="assets/','href="../assets/').replaceAll('src="assets/','src="../assets/').replaceAll('url(assets/','url(../assets/');
html=html.replace('<head>','<head>\n<meta name="robots" content="noindex,nofollow"><script src="market-history-check.js"></script>');
html=html.replace(/<body([^>]*)>/,`<body$1><aside style="padding:16px;background:#fff1ce;color:#491008;border-bottom:4px solid #491008">
Simulated sales ledger · Local contract check · Not real server transactions · Writes blocked
<nav style="display:flex;flex-wrap:wrap;gap:12px"><a href="?state=connected#price-tracker">Connected fixture</a><a href="?state=empty#price-tracker">Empty</a><a href="?state=unavailable#price-tracker">Unavailable</a></nav></aside>`);
await writeFile('public/preview/market-history-check.html',html);
