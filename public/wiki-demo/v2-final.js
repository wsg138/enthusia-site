(()=>{
const P=window.WIKI_V2.pages;
if(P.mechanics){
  const sleep='<a class="topic-card" data-page="sleep"><b>Sleep</b><span>faster nights and phantom-rest registration</span></a>';
  const spawn='<a class="topic-card" data-page="spawn"><b>Spawn</b><span>death respawns, spawn teleporting and pearl protections</span></a>';
  if(P.mechanics.body.includes(sleep)&&!P.mechanics.body.includes('data-page="spawn"')) P.mechanics.body=P.mechanics.body.replace(sleep,sleep+spawn);
  const java='<a class="topic-card" data-page="java-bedrock"><b>Java & Bedrock</b><span>what is shared and where the interface differs</span></a>';
  const supporters='<a class="topic-card" data-page="supporters"><b>Supporters & Donors</b><span>public supporter rankings and in-game displays</span></a>';
  if(P.mechanics.body.includes(java)&&!P.mechanics.body.includes('data-page="supporters"')) P.mechanics.body=P.mechanics.body.replace(java,java+supporters);
}
if(P.leaderboards&&typeof P.leaderboards.body==='string') P.leaderboards.body=P.leaderboards.body.replace('Public donor/support rankings are displayed through the server website and in-game presentation.','See <a data-page="supporters">Supporters & Donors</a> for public donor/support rankings and in-game displays.');
})();