// Captured public data only; this page uses the actual production renderer.
const originalFetch=window.fetch.bind(window);
const playerData=originalFetch(new URL('./real-player-data.json',document.currentScript.src)).then(response=>{
  if(!response.ok)throw new Error('Captured profiles unavailable');return response.json();
});
window.fetch=async(input,options={})=>{
  const method=options.method??(input instanceof Request?input.method:'GET');
  if(method!=='GET')return Response.json({error:'preview_actions_are_not_saved'},{status:501});
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.pathname==='/api/community/players')return Response.json(await playerData);
  return originalFetch(input,options);
};
