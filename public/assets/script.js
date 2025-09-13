// Site init + server status + Discord mini-widget (no bots)
async function initSite(cfg){
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const ip = (cfg.serverIp || '').trim();
  const tebex = cfg.tebexUrl || 'https://example.tebex.io';
  const invite = cfg.discordInvite || 'https://discord.gg/yourInvite';
  const serverId = (cfg.discordServerId || '').trim();

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

  // ===== Discord mini widget (no bots, no channels) =====
  const card = document.getElementById('discordCard');
  if (card && serverId){
    try{
      const url = `https://discord.com/api/guilds/${encodeURIComponent(serverId)}/widget.json`;
      const resp = await fetch(url, { mode:'cors' });
      if (!resp.ok) throw new Error('widget disabled or unavailable');
      const data = await resp.json();

      // humans-only (Discord includes "bot": true on bot members)
      const members = Array.isArray(data.members) ? data.members : [];
      const humans = members.filter(m => m && m.bot !== true);
      const humanCount = humans.length;

      // render avatars (up to 12)
      const avatars = humans.slice(0, 12).map(m => {
        const src = m.avatar_url || m.avatarURL || '';
        const alt = (m.nick || m.username || 'user');
        return `<img src="${src}" alt="${alt}" loading="lazy">`;
      }).join('');

      card.innerHTML = `
        <div class="discord-card">
          <div class="discord-head">
            <div class="discord-title">Discord</div>
            <div class="discord-counts">
              <span class="pill"><span class="dot"></span>${humanCount} online</span>
            </div>
          </div>
          <div class="discord-avatars">${avatars || '<span class="muted">No members visible right now.</span>'}</div>
          <div class="discord-actions">
            <a class="btn ghost" href="${(data.instant_invite || invite)}" target="_blank" rel="noopener">Open Discord</a>
          </div>
        </div>
      `;
    }catch(e){
      // Fallback: join button only
      card.innerHTML = `
        <div class="discord-card">
          <div class="discord-head">
            <div class="discord-title">Discord</div>
          </div>
          <p class="muted">Live info isn’t available right now.</p>
          <div class="discord-actions">
            <a class="btn ghost" href="${invite}" target="_blank" rel="noopener">Open Discord</a>
          </div>
        </div>
      `;
    }
  }
}
