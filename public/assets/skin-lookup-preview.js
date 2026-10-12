// Read-only preview using captured public leaderboard responses. Production never loads this file.
(function(){
  const nativeFetch=window.fetch.bind(window);
  const ready=nativeFetch(new URL('../preview/skin-check-data.json',document.currentScript.src)).then(r=>r.json());
  window.fetch=async function(input,options={}){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname.startsWith('/api/leaderboards/')&&(options.method??'GET').toUpperCase()==='GET'){
      const data=await ready,row=data.boards[url.pathname];
      if(row)return new Response(JSON.stringify(row.payload),{status:row.status,headers:{'content-type':'application/json'}});
    }
    return nativeFetch(input,options);
  };
})();
