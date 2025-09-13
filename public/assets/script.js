// Site init + server status via mcstatus.io (no cursor JS needed)
function initSite(cfg){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const ip = (cfg.serverIp || '').trim();
  const tebex = cfg.tebexUrl || 'https://example.tebex.io';
  const invite = cfg.discordInvite || 'https://discord.gg/yourInvite';

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
}
