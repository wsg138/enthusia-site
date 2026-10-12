// Captured public server feed for visual verification. Production never loads this adapter.
(function () {
  const nativeFetch = window.fetch.bind(window);
  const ready = nativeFetch(new URL('market-members-data.json', document.currentScript.src)).then(response => response.json());
  window.fetch = async function (input, options = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const method = (options.method ?? input.method ?? 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) return new Response(JSON.stringify({error:'preview_actions_are_not_saved'}), {status:405,headers:{'content-type':'application/json'}});
    if (url.origin === 'https://market-api.enthusia.info' && url.pathname === '/v1/market') {
      return new Response(JSON.stringify(await ready), {headers:{'content-type':'application/json'}});
    }
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({error:'community_service_unavailable'}), {status:503,headers:{'content-type':'application/json'}});
    return nativeFetch(input, options);
  };
  document.addEventListener('DOMContentLoaded', async () => {
    const snapshot = await ready;
    const banner = document.createElement('aside');
    banner.setAttribute('aria-label','Preview information');
    banner.style.cssText = 'padding:12px 16px;background:#ffcf1f;color:#3a0d0a;border-bottom:4px solid #4a0b08;font-family:Minecraft,monospace;line-height:1.5';
    banner.textContent = 'Members panel preview · captured public server data from '+new Date(snapshot.generatedAt).toLocaleString()+'. Read only; not the live website. ';
    const button = document.createElement('button');
    button.className = 'btn btn-gold';button.type = 'button';button.textContent = 'Open Members panel';
    button.addEventListener('click', () => window.EnthusiaMarketMap?.showStall('stall13'));
    banner.append(button);document.body.prepend(banner);
    let attempts = 0;
    const open = () => {
      if (window.EnthusiaMarketMap?.getSnapshot()) { window.EnthusiaMarketMap.showStall('stall13');return; }
      if (++attempts < 80) setTimeout(open,250);
    };
    open();
  });
})();
