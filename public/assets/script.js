// Basic site init and server status fetch using mcstatus.io
function initSite(cfg){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const ip = cfg.serverIp || 'your.server.net';
  const tebex = cfg.tebexUrl || 'https://example.tebex.io';
  const invite = cfg.discordInvite || 'https://discord.gg/yourInvite';
  const discordId = cfg.discordServerId || '';

  // Wire header links
  const storeLink = document.getElementById('storeLink');
  if (storeLink) storeLink.href = tebex;
  const discordLink = document.getElementById('discordLink');
  if (discordLink) discordLink.href = invite;

  // Wire hero CTAs
  const copyIpBtn = document.getElementById('copyIpBtn');
  if (copyIpBtn) {
    copyIpBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ip); copyIpBtn.textContent = 'Copied!'; setTimeout(()=>copyIpBtn.textContent='Copy IP',1500);} catch{}
    });
  }
  const joinDiscordBtn = document.getElementById('joinDiscordBtn');
  if (joinDiscordBtn) joinDiscordBtn.href = invite;
  const openStoreBtn = document.getElementById('openStoreBtn');
  if (openStoreBtn) openStoreBtn.href = tebex;

  const ipEl = document.getElementById('serverIp');
  if (ipEl) ipEl.textContent = ip;

  // Update Discord widget iframe if provided
  const widget = document.getElementById('discordWidget');
  if (widget && discordId) {
    widget.src = `https://discord.com/widget?id=${encodeURIComponent(discordId)}&theme=dark`;
  }

  // Fetch player count from mcstatus.io (cached ~60s on their side)
  async function fetchStatus(){
    const statusEl = document.getElementById('serverStatus');
    const countEl = document.getElementById('playerCount');
    if (!statusEl || !countEl) return;

    try{
      const resp = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(ip)}`);
      if (!resp.ok) throw new Error('bad response');
      const data = await resp.json();
      const online = !!(data && data.online);
      statusEl.textContent = online ? 'online' : 'offline';
      countEl.textContent = online && data.players && typeof data.players.online === 'number' ? data.players.online : '0';
    }catch(err){
      statusEl.textContent = 'unknown';
      countEl.textContent = '—';
    }
  }
  fetchStatus();
  setInterval(fetchStatus, 60000);
}
