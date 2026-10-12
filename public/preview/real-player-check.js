// Captured public data only; this page uses the actual production renderer.
const originalFetch=window.fetch.bind(window);
const playerData=originalFetch(new URL('./real-player-data.json',document.currentScript.src)).then(response=>{
  if(!response.ok)throw new Error('Captured profiles unavailable');return response.json();
});
const marketData=originalFetch(new URL('./real-player-market-data.json',document.currentScript.src))
  .then(response=>response.ok?response.json():null).catch(()=>null);
const guildData=originalFetch(new URL('./real-player-guild-data.json',document.currentScript.src))
  .then(response=>response.ok?response.json():null).catch(()=>null);
document.addEventListener('DOMContentLoaded',()=>{
  const update=()=>{for(const link of document.querySelectorAll('a[href]')){
    const url=new URL(link.getAttribute('href'),location.href);
    if(url.origin===location.origin&&url.pathname.endsWith('/guilds.html'))link.setAttribute('href','real-player-guilds.html'+url.hash);
    if(url.origin===location.origin&&url.pathname.endsWith('/players.html'))link.setAttribute('href','real-player-check.html?profile=real'+url.hash);
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
      id:'profile-contract-example',name:'Example profile',previewExample:true,balance:42,playtime:12,
      balanceRank:3,playtimeRank:8,guildsKnown:true,guildMemberships:[{id:'example-guild',name:'Example guild',level:25,banner:{baseColor:'RED',patterns:[{type:'BORDER',color:'BLACK'}]}}]
    });
    return Response.json(data);
  }
  if(url.origin==='https://market-api.enthusia.info')return Response.json(await marketData);
  if(url.pathname==='/api/community/guilds')return Response.json(await guildData);
  return originalFetch(input,options);
};
