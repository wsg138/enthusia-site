(()=>{
const P=window.WIKI_V2.pages;
if(P['history-lore']&&typeof P['history-lore'].body==='string'){
  P['history-lore'].body=P['history-lore'].body.replace('<p>Gameplay minigames are documented on <a data-page="events">Server Events</a>, not in server lore unless a particular event later becomes historically important to the community.</p>','');
}
if(P.betas){
  P.betas.body='<p>This page covers Enthusia\'s beta-era history: players, guilds, builds, conflicts and major moments from before the permanent SMP.</p><p><a data-community="We On Top (WOT)">We On Top (WOT)</a> records participation in the beta End fight and EOTW. Other beta-era player and guild articles can be connected here as that history is documented.</p>';
}
if(P.market&&typeof P.market.body==='string'){
  P.market.body=P.market.body.replace(/\[https:\/\/badgersmc\.github\.io\/EnthusiaMarket\/([^\s\]]*)\s+([^\]]+)\]/g,(_,path,label)=>`${label}: <code>badgersmc.github.io/EnthusiaMarket/${path}</code>`);
}
})();