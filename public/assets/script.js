// Site init + server status via mcstatus.io + BIG cursor glow (mouse & touch)
function initSite(cfg){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const ip = (cfg.serverIp || '').trim();
  const tebex = cfg.tebexUrl || 'https://example.tebex.io';
  const invite = cfg.discordInvite || 'https://discord.gg/yourInvite';
  const discordId = cfg.discordServerId || '';

  // Header links
  const storeLink = document.getElementById('storeLink');
  if (storeLink) storeLink.href = tebex;
  const discordLink = document.getElementById('discordLink');
  if (discordLink) discordLink.href = invite;

  // Hero CTAs
  const copyIpBtn = document.getElementById('copyIpBtn');
  if (copyIpBtn) {
    copyIpBtn.addEventListener('click', async () => {
      try {
        const text = ip && ip.toLowerCase() !== 'unavailable' ? ip : 'Server IP is currently unavailable';
        await navigator.clipboard.writeText(text);
        copyIpBtn.textContent = 'Copied!';
        setTimeout(()=>copyIpBtn.textContent='Copy IP',1500);
      } catch {}
    });
  }
  const joinDiscordBtn = document.getElementById('joinDiscordBtn');
  if (joinDiscordBtn) joinDiscordBtn.href = invite;
  const openStoreBtn = document.getElementById('openStoreBtn');
  if (openStoreBtn) openStoreBtn.href = tebex;

  const ipEl = document.getElementById('serverIp');
  if (ipEl) ipEl.textContent = ip || 'Unavailable';

  // Discord widget/banner: you’re using the banner <img>, so no iframe logic needed here

  // Server status via mcstatus.io (skip if IP unavailable)
  const validIp = ip && ip.toLowerCase() !== 'unavailable';
  const statusEl = document.getElementById('serverStatus');
  const countEl = document.getElementById('playerCount');

  async function fetchStatus(){
    if (!statusEl || !countEl) return;
    if (!validIp) {
      statusEl.textContent = 'TBA';
      countEl.textContent = '—';
      return;
    }
    try{
      const resp = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(ip)}`);
      if (!resp.ok) throw new Error('bad response');
      const data = await resp.json();
      const online = !!(data && data.online);
      statusEl.textContent = online ? 'online' : 'offline';
      countEl.textContent = online && data.players && typeof data.players.online === 'number' ? data.players.online : '0';
    }catch{
      statusEl.textContent = 'unknown';
      countEl.textContent = '—';
    }
  }
  fetchStatus();
  setInterval(fetchStatus, 60000);

  // === BIG cursor glow (mouse & touch) ===
  const glow = document.getElementById('cursor-glow');
  if (glow && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let raf = null;
    let hideTimer = null;
    function moveGlow(x, y){
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=>{ glow.style.transform = `translate(${x}px, ${y}px)`; });
    }
    function showGlow(){
      glow.style.opacity = '0.9';
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      hideTimer = setTimeout(()=> glow.style.opacity = '0.55', 800); // gentle fade after idle
    }

    // Mouse
    window.addEventListener('pointermove', (e)=>{
      moveGlow(e.clientX, e.clientY);
      showGlow();
    }, { passive:true });

    // Touch (iOS): follow finger while moving; fade after lift
    window.addEventListener('touchmove', (e)=>{
      const t = e.touches && e.touches[0];
      if (!t) return;
      moveGlow(t.clientX, t.clientY);
      showGlow();
    }, { passive:true });
    window.addEventListener('touchend', ()=>{ glow.style.opacity = '0.45'; }, { passive:true });
    window.addEventListener('mouseleave', ()=>{ glow.style.opacity = '0.45'; });
  }
}
