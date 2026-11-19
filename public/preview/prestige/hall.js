import {el} from '../../assets/community-dom.js';
import {playerHead} from '../../assets/exact-player-profile.js';

const date = value => new Date(value).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const gold = value => value.toLocaleString('en-US') + ' gold';
const art = file => new URL(file, import.meta.url).href;
const badge = (tier, size) => el('img', {src:art('badge-' + tier + '.png'), width:size, height:size, alt:''});
const guildLink = guild => el('a', {href:'#g-' + guild.guildId, text:guild.name});

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

function milestone(entry, tier) {
  const people = el('details', {class:'roster'}, [
    el('summary',{text:'Stood with them · ' + entry.creditedTotal + ' members'})
  ]);
  people.addEventListener('toggle', () => {
    if (!people.open || people.childElementCount > 1) return;
    const heads = el('div',{class:'heads'});
    for (const id of entry.credited) {
      const head = playerHead({id,name:'Sample member',previewExample:true},32);
      head.title = id;
      heads.append(head);
    }
    people.append(heads);
    if(entry.creditedTotal > entry.credited.length) people.append('and ' + (entry.creditedTotal-entry.credited.length) + ' more');
  });
  return el('li',{},[badge(entry.tier,32), el('strong',{text:'Prestige ' + tier.roman}),
    el('time',{datetime:entry.reachedAt,text:date(entry.reachedAt)}),
    entry.firstOnServer && el('span',{class:'tag tag-gold',text:'Server first'}),
    el('p',{text:[gold(entry.feePaid),entry.keptReward?.name].filter(Boolean).join(' · ')}), people]);
}

function render(snapshot) {
  const tiers = new Map(snapshot.tiers.map(t => [t.tier,t]));
  const guilds = [...snapshot.guilds].sort((a,b) => a.hallRank-b.hallRank);
  const recent = snapshot.recent.find(event => !event.disbanded && guilds.some(g => g.id === event.guildId));
  // The demo is frozen at the supplied snapshot, including its spotlight window.
  const fresh = recent && Date.parse(snapshot.generatedAt)-Date.parse(recent.reachedAt) < 7*86400000;
  const guild = fresh ? guilds.find(g => g.id === recent.guildId) : guilds[0];
  if (guild) {
    const tier = fresh ? recent.tier : guild.tier;
    const reached = fresh ? recent.reachedAt : guild.reachedAt;
    const history = guild.history.find(h => h.tier === tier);
    document.querySelector('#spotlight').append(fresh ? rankUp(tier) : badge(tier,128),
      el('div',{},[el('p',{class:'tag tag-gold',text:fresh?'Latest prestige':'Reigning guild'}),
        el('h2',{},[guildLink({guildId:guild.id,name:guild.name})]),
        el('p',{text:'Prestige ' + tiers.get(tier).roman + ' · ' + date(reached)}),
        history && el('p',{text:history.creditedTotal + ' members stood with them.' + (history.keptReward?' They kept ' + history.keptReward.name + '.':'')})]));
  } else document.querySelector('#spotlight').textContent='No guild has prestiged yet.';
  for (const tier of snapshot.tiers) {
    const first=tier.first;
    document.querySelector('#firsts').append(el('article',{class:'panel first' + (first?'':' unclaimed')},[
      badge(tier.tier,64),el('h3',{text:'Prestige ' + tier.roman}),
      first && !first.disbanded ? guildLink(first) : el('strong',{text:first?.name ?? 'Unclaimed'}),
      first && el('time',{datetime:first.reachedAt,text:date(first.reachedAt)}),
      first?.disbanded && el('span',{class:'tag tag-plain',text:'Disbanded'})]));
    document.querySelector('#fees').append(el('li',{text:'Prestige ' + tier.roman + ' · ' + [gold(tier.fee), ...tier.perks.map(p=>p.replaceAll('_',' '))].join(' · ')}));
  }
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
      const card=el('details',{class:'panel guild-card',id:'g-'+g.id},[summary,
        el('ol',{class:'milestones'},g.history.map(h=>milestone(h,tiers.get(h.tier))))]);
      ladder.append(card);
    }
  }
  for(const [label,value] of [['Prestiges completed',snapshot.totals.prestiges],['Guilds that have prestiged',snapshot.totals.guildsPrestiged],['Server firsts claimed',snapshot.totals.tiersClaimed+' / '+snapshot.maxTier],['Gold invested',snapshot.totals.goldSpent.toLocaleString('en-US')]]) {
    document.querySelector('#totals').append(el('div',{},[el('dt',{text:label}),el('dd',{text:value})]));
  }
  function openGuild() {
    const card=document.getElementById(location.hash.slice(1));
    if(card?.matches('.guild-card')) {card.open=true;card.scrollIntoView({block:'start'});}
  }
  window.addEventListener('hashchange',openGuild);
  document.querySelector('#hall').addEventListener('click',e=>{
    if(e.target.closest('a')?.hash === location.hash && location.hash) openGuild();
  });
  openGuild();
}

try {
  const response=await fetch(art('sample.json'));
  if(!response.ok) throw new Error('Sample unavailable');
  render(await response.json());
} catch {
  document.querySelector('#hall').replaceChildren(el('p',{class:'panel fees',role:'status',text:'The sample Hall of Prestige could not be loaded. Refresh to try again.'}));
}
