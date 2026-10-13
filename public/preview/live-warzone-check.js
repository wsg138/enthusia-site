// Synthetic native exporter fixture; never production or a real duel result.
const nativeFetch=window.fetch.bind(window),fixture=nativeFetch(new URL('./live-warzone-check-data.json',document.currentScript.src)).then(response=>response.json());
let refreshes=0;
window.fetch=async(input,options={})=>{
  const method=options.method??(input instanceof Request?input.method:'GET');
  if(method!=='GET')return Response.json({error:'preview_actions_are_not_saved'},{status:501});
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.pathname==='/api/community/warzone'){
    const state=new URLSearchParams(location.search).get('state')??'connected';
    if(state==='unavailable')return Response.json({error:'community_service_unavailable'},{status:503});
    const data=structuredClone(await fixture),now=new Date(),week=new Date(now);
    week.setUTCHours(0,0,0,0);week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7));
    // Refresh dates/counts are simulated to demonstrate the actual refresh UI.
    data.generatedAt=now.toISOString();data.duelUpdatedAt=now.toISOString();data.weekStartsAt=week.toISOString();
    for(const row of data.items.filter(row=>row.type==='leader'))row.wins+=refreshes;
    refreshes++;
    if(state==='empty'){data.items=data.items.filter(row=>row.type!=='leader');data.items.find(row=>row.id==='duels-status').description='No counted match wins this week.';}
    if(state==='stale'){data.stale=true;data.duelUpdatedAt=new Date(now.getTime()-3600000).toISOString();}
    if(state==='paused'){const kit=data.items.find(row=>row.type==='kit');kit.endsAt=null;kit.manualOverride=false;data.items.find(row=>row.id==='next-meta').name='Automatic schedule paused';}
    return Response.json(data);
  }
  if(url.pathname.startsWith('/api/'))return Response.json({error:'community_service_unavailable'},{status:503});
  return nativeFetch(input,options);
};
