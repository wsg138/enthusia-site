/** Refresh visible public views, with one request and explicit lifecycle cleanup. */
export function refreshPublicFeed(load,onData,onError,options={}){
  const doc=options.document??document,events=options.events??window;
  const set=options.setTimeout??setTimeout,clear=options.clearTimeout??clearTimeout;
  let timer,request,stopped=false,suspended=false;
  function schedule(){if(!stopped&&!suspended&&doc.visibilityState!=='hidden')timer=set(refresh,options.interval??60000);}
  async function refresh(){
    clear(timer);timer=undefined;
    if(stopped||suspended||doc.visibilityState==='hidden'||request)return;
    const current=new AbortController();request=current;
    const deadline=set(()=>current.abort(),options.timeout??5000);
    try{const data=await load(current.signal);if(!stopped&&request===current)onData(data);}
    catch(error){if(!stopped&&request===current)onError(error);}
    finally{clear(deadline);if(request===current){request=undefined;schedule();}}
  }
  function pause(){clear(timer);timer=undefined;request?.abort();request=undefined;}
  function visibility(){if(doc.visibilityState==='hidden')pause();else refresh();}
  function pagehide(event){if(!event.persisted)stop();else{suspended=true;pause();}}
  function pageshow(event){if(event.persisted){suspended=false;refresh();}}
  function stop(){stopped=true;pause();doc.removeEventListener('visibilitychange',visibility);events.removeEventListener('pagehide',pagehide);events.removeEventListener('pageshow',pageshow);}
  doc.addEventListener('visibilitychange',visibility);events.addEventListener('pagehide',pagehide);events.addEventListener('pageshow',pageshow);
  refresh();return {refresh,stop};
}
