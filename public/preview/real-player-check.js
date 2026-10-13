// Captured public data only; this page uses the actual production renderer.
const originalFetch=window.fetch.bind(window);
const playerData=originalFetch(new URL('./real-player-data.json',document.currentScript.src)).then(response=>{
  if(!response.ok)throw new Error('Captured profiles unavailable');return response.json();
});
const marketData=originalFetch(new URL('./real-player-market-data.json',document.currentScript.src))
  .then(response=>response.ok?response.json():null).catch(()=>null);
const guildData=originalFetch(new URL('./real-player-guild-data.json',document.currentScript.src))
  .then(response=>response.ok?response.json():null).catch(()=>null);
const activityData=originalFetch(new URL('./real-player-activity-data.json',document.currentScript.src))
  .then(response=>response.ok?response.json():{}).catch(()=>({}));
document.addEventListener('DOMContentLoaded',()=>{
  const update=()=>{for(const link of document.querySelectorAll('a[href]')){
    const url=new URL(link.getAttribute('href'),location.href);
    if(url.origin===location.origin&&url.pathname.endsWith('/guilds.html'))link.setAttribute('href','real-player-guilds.html'+url.hash);
    if(url.origin===location.origin&&url.pathname.endsWith('/players.html'))link.setAttribute('href','real-player-check.html?profile=real'+url.hash);
    for(const kind of ['guildquests','bounties','achievements'])if(url.origin===location.origin&&url.pathname.endsWith('/'+kind+'.html'))link.setAttribute('href','real-player-'+kind+'.html'+url.hash);
    if(url.origin===location.origin&&url.pathname.endsWith('/index.html')&&url.hash==='#warzone')link.setAttribute('href','real-player-warzone.html#warzone');
  }};
  new MutationObserver(update).observe(document.body,{childList:true,subtree:true});update();
});
window.fetch=async(input,options={})=>{
  const method=options.method??(input instanceof Request?input.method:'GET');
  if(method!=='GET')return Response.json({error:'preview_actions_are_not_saved'},{status:501});
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.pathname==='/api/community/players'){
    const data=structuredClone(await playerData);
    if(new URLSearchParams(location.search).get('profile')==='example')data.items.push({
      id:'00000000-0000-4000-8000-000000000052',name:'Example profile',previewExample:true,balance:42,playtime:12,achievementsKnown:true,achievements:['Simulated milestone'],
      weeklyDuelWins:{wins:4,weekStartsAt:'2026-10-12T00:00:00Z',capturedAt:'2026-10-13T00:00:00Z'},
      balanceRank:3,playtimeRank:8,guildsKnown:true,guildMemberships:[{id:'example-guild',name:'Example guild',level:25,banner:{baseColor:'RED',patterns:[{type:'BORDER',color:'BLACK'}]}}]
    });
    return Response.json(data);
  }
  if(url.origin==='https://market-api.enthusia.info')return Response.json(await marketData);
  if(url.pathname==='/api/community/guilds')return Response.json(await guildData);
  if(url.pathname==='/api/community/achievements')return Response.json({items:[],curated:[]});
  const kind=url.pathname.match(/^\/api\/community\/(guildquests|bounties|warzone)$/)?.[1];
  if(kind){
    if(new URLSearchParams(location.search).get('profile')==='example'){
      if(kind==='bounties')return Response.json({generatedAt:new Date().toISOString(),items:[{id:'00000000-0000-4000-8000-000000000052',name:'Example profile',gold:12,state:'open'}]});
      if(kind==='guildquests')return Response.json({generatedAt:new Date().toISOString(),limited:true,currentWeekId:'simulated-week',items:[{id:'simulated-week',startsAt:'2020-01-01T00:00:00Z',endsAt:'2030-01-01T00:00:00Z',quests:[{id:'simulated-quest',name:'Simulated quest',targetCount:'100',leaderboard:true,standings:[{guildId:'example-guild',count:'42',rank:2,claimed:false}]}]}]});
    }
    const data=(await activityData)[kind];return data?Response.json(data):Response.json({error:'community_service_unavailable'},{status:503});
  }
  return originalFetch(input,options);
};
