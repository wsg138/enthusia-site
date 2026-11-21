import {api,el} from '../../assets/community-dom.js';
import {playerHead} from '../../assets/exact-player-profile.js';

const date = value => new Date(value).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const gold = value => value==null ? null : value.toLocaleString('en-US') + ' gold';
const sampleMode = new URLSearchParams(location.search).get('source') !== 'server';
const art = file => new URL(file, import.meta.url).href;
const badge = (tier, size) => el('img', {src:art('badge-' + tier + '.png'), width:size, height:size, alt:''});
const guildLink = (guild,tier,label=guild.name) => el('a', {
  href:'#g-' + guild.guildId + (tier ? '-tier-'+tier : ''), text:label
});

function rankUp(tier) {
  const holder = el('div', {class:'rank-art'}, [badge(tier,128)]);
  const sheet = new Image();
  sheet.onload = () => {
    const canvas = el('canvas', {width:256, height:128, 'aria-hidden':'true'});
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    holder.replaceChildren(canvas);
    const start = performance.now();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    function draw(now) {
      const frame = motion.matches ? 63 : Math.min(63, Math.max(0,Math.floor((now-start)/50)));
      ctx.clearRect(0,0,256,128);
      ctx.drawImage(sheet,frame%8*256,Math.floor(frame/8)*128,256,128,0,0,256,128);
      if (frame < 63) requestAnimationFrame(draw);
    }
    draw(start);
  };
  sheet.src = art('rankup-' + tier + '.png');
  return holder;
}

function milestone(guildId, entry, tier, players) {
  const people = el('details', {class:'roster'}, [
    el('summary',{text:'Stood with them · ' + entry.creditedTotal + ' members'})
  ]);
  people.addEventListener('toggle', () => {
    if (!people.open || people.childElementCount > 1) return;
    const heads = el('div',{class:'heads'});
    for (const credit of entry.credited) {
      const player=typeof credit==='string' ? (players.get(credit)??{id:credit}) : {id:credit.uuid,name:credit.name};
      const head=playerHead(player,32);
      head.alt=player.name?'':'Credited member';
      const profile=(sampleMode?'':'../')+'players.html#'+encodeURIComponent(player.id);
      heads.append(player.name ? el('a',{href:profile},[head,player.name]) : head);
    }
    people.append(heads);
    const remaining=entry.creditedTotal-entry.credited.length;
    if(remaining)people.append(el('small',{text:'and '+remaining+' more'}));
  });
  return el('li',{id:'g-'+guildId+'-tier-'+tier.tier,tabindex:'-1'},[badge(entry.tier,32), el('strong',{text:'Prestige ' + tier.roman}),
    el('time',{datetime:entry.reachedAt,text:date(entry.reachedAt)}),
    entry.firstOnServer && el('span',{class:'tag tag-gold',text:'Server first'}),
    el('p',{text:[gold(entry.feePaid),entry.keptReward?.name].filter(Boolean).join(' · ')}), people]);
}

function renderSpotlight(snapshot, tiers, guilds) {
  const recent = snapshot.recent.find(event => !event.disbanded && guilds.some(g => g.id === event.guildId));
  // The demo is frozen at the supplied snapshot, including its spotlight window.
  const now = sampleMode ? Date.parse(snapshot.generatedAt) : Date.now();
  const weekMs = 7*24*60*60*1000;
  const fresh = recent && now-Date.parse(recent.reachedAt) < weekMs;
  const guild = fresh ? guilds.find(g => g.id === recent.guildId) : guilds[0];
  if (!guild) {
    document.querySelector('#spotlight').textContent='No guild has prestiged yet.';
    return;
  }
  spotlightCard(guild, fresh ? recent : guild, tiers, Boolean(fresh));
}

function spotlightCard(guild, event, tiers, fresh) {
    const tier = event.tier;
    const reached = event.reachedAt;
    const history = guild.history.find(h => h.tier === tier);
    document.querySelector('#spotlight').append(fresh ? rankUp(tier) : badge(tier,128),
      el('div',{},[el('p',{class:'tag tag-gold',text:fresh?'Latest prestige':'Reigning guild'}),
        el('h2',{class:'guild-identity'},[window.EnthusiaGuildBannerRenderer.create(guild.banner,guild.name+' banner'),guildLink({guildId:guild.id,name:guild.name})]),
        el('p',{text:'Prestige ' + tiers.get(tier).roman + ' · ' + date(reached)}),
        history && el('p',{text:history.creditedTotal + ' members stood with them.' + (history.keptReward?' They kept ' + history.keptReward.name + '.':'')}),
        history && el('a',{class:'btn btn-gold',href:'#g-'+guild.id+'-tier-'+tier,text:'View milestone'})]));
}

function renderFirsts(snapshot) {
  for (const tier of snapshot.tiers) {
    const first=tier.first;
    document.querySelector('#firsts').append(el('article',{class:'tip first' + (first?'':' unclaimed')},[
      badge(tier.tier,64),el('h3',{text:'Prestige ' + tier.roman}),
      first && !first.disbanded ? guildLink(first,tier.tier) : el('strong',{text:first?.name ?? 'Unclaimed'}),
      first && el('time',{datetime:first.reachedAt,text:date(first.reachedAt)}),
      first?.disbanded && el('span',{class:'tag tag-plain',text:'Disbanded'})]));
    document.querySelector('#fees').append(el('li',{text:'Prestige ' + tier.roman + ' · ' + [gold(tier.fee), ...tier.perks.map(p=>p.split('_').join(' '))].join(' · ')}));
  }
}

function renderLadder(snapshot, tiers, guilds, players) {
  for (const tier of [...snapshot.tiers].reverse()) {
    const group = guilds.filter(g=>g.tier===tier.tier);
    if (!group.length) continue;
    const ladder = document.querySelector('#ladder');
    ladder.append(el('h3',{text:'Prestige ' + tier.roman}));
    for (const g of group) {
      const banner=window.EnthusiaGuildBannerRenderer.create(g.banner,g.name + ' banner');
      const summary=el('summary',{},[banner,el('span',{},[
        el('strong',{text:'#' + g.hallRank + ' ' + g.name}),el('small',{text:[g.tag,'Level ' + g.level,g.memberCount+' members'].join(' · ')}),
        el('small',{text:'Prestige ' + tier.roman + ' since ' + date(g.reachedAt)})]),badge(g.tier,32)]);
      const card=el('details',{class:'tip guild-card',id:'g-'+g.id},[summary,
        el('a',{class:'btn btn-dark',href:(sampleMode?'':'../')+'guilds.html#'+encodeURIComponent(g.id),text:'View guild profile'}),
        el('ol',{class:'milestones'},g.history.map(h=>milestone(g.id,h,tiers.get(h.tier),players)))]);
      ladder.append(card);
    }
  }
}

function render(snapshot, players) {
  const tiers = new Map(snapshot.tiers.map(t => [t.tier,t]));
  const guilds = [...snapshot.guilds].sort((a,b) => a.hallRank-b.hallRank);
  renderSpotlight(snapshot,tiers,guilds);
  renderFirsts(snapshot);
  renderLadder(snapshot,tiers,guilds,players);
  for(const [label,value] of [['Prestiges completed',snapshot.totals.prestiges],['Guilds that have prestiged',snapshot.totals.guildsPrestiged],['Server firsts claimed',snapshot.totals.tiersClaimed+' / '+snapshot.maxTier],['Gold invested',snapshot.totals.goldSpent.toLocaleString('en-US')]]) {
    document.querySelector('#totals').append(el('div',{},[el('dt',{text:label}),el('dd',{text:value})]));
  }
  function openGuild() {
    const target=document.getElementById(location.hash.slice(1));
    const card=target?.closest('.guild-card');
    if(card){card.open=true;target.scrollIntoView({block:'start'});if(target!==card)target.focus({preventScroll:true});}
  }
  window.addEventListener('hashchange',openGuild);
  document.querySelector('#hall').addEventListener('click',e=>{
    if(e.target.closest('a')?.hash === location.hash && location.hash) openGuild();
  });
  openGuild();
}

const sourceLink=document.querySelector('#feed-switch');
if (!sampleMode) {
  sourceLink.href='?source=sample';
  sourceLink.textContent='View sample Hall';
}
const status=document.querySelector('#feed-status');
try {
  let snapshot,players=[];
  if (sampleMode) {
    const response=await fetch(art('sample.json'));
    if(!response.ok) throw new Error('Sample unavailable');
    snapshot=await response.json();
    players=(await api('players').catch(()=>({items:[]}))).items;
    status.textContent='Sample guilds and milestones · '+date(snapshot.generatedAt);
  } else {
    snapshot=await api('prestige');
    status.textContent=(snapshot.stale?'Last known standings':'Server standings')+' · Updated '+new Date(snapshot.generatedAt).toLocaleString();
  }
  render(snapshot,new Map(players.map(player=>[player.id,player])));
} catch {
  status.textContent=sampleMode?'Sample standings unavailable.':'Server standings unavailable.';
  for (const section of document.querySelectorAll('#hall > section')) section.hidden=true;
}
