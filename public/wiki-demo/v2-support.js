(()=>{
const P=window.WIKI_V2.pages;
const facts=(items)=>`<div class="fact-grid">${items.map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
const details=(title,subtitle,html)=>`<details class="drop"><summary><b>${title}</b>${subtitle?`<span>${subtitle}</span>`:''}</summary><div>${html}</div></details>`;
const table=(rows,head='')=>`<table>${head?`<thead><tr>${head.split('|').map(x=>`<th>${x}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const list=(items)=>`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
const card=(id,title,desc)=>`<a class="topic-card" data-page="${id}"><b>${title}</b><span>${desc}</span></a>`;

P.autoclicker={title:'AutoClicker',section:'Mechanics',summary:'A server-side stationary hostile-mob farming helper for Java and Bedrock.',body:`
<p><code>/autoclick</code> runs a server-side attack helper intended for stationary hostile-mob farming. It does not require a client mod and works for both Java and Bedrock players.</p>
<h2>Using it</h2>${table([
['<code>/autoclick</code>','Toggle normal cooldown-based attacks.'],
['<code>/autoclick &lt;ticks&gt;</code>','Use a fixed attack interval. The minimum is 1 tick.'],
['<code>/autoclick status</code>','Show whether AutoClicker is active and its current mode.']])}
<h2>Targeting</h2><p>AutoClicker attacks valid hostile mobs within about 3 blocks and respects walls/collision. It does not deliberately target players, pets or passive animals.</p>
<h2>When it stops</h2>${list([
'Moving too far from the point where you activated it.',
'Entering PvP combat.',
'Opening menus or starting teleports.',
'Changing world, dying or disconnecting.',
'Entering an invalid game mode.'
])}
<p>If there is no valid target, the attack animation can continue without damaging anything.</p>
`};

P.sleep={title:'Sleep',section:'Mechanics',summary:'How sleeping accelerates the Overworld night and resets phantom rest.',body:`
<p>Sleeping speeds up the Overworld night instead of requiring a fixed percentage of online players to sleep.</p>
${facts([['1 active sleeper','about 2.5× normal night speed'],['2 sleepers','about 4×'],['3 sleepers','about 5.5×'],['Phantom rest reset','after 10 real seconds sleeping']])}
<h2>Night speed</h2><p>Each active sleeper adds more time acceleration. You do not need everyone—or a percentage of the server—to get into bed.</p>
<h2>Phantoms</h2><p>You must actually stay asleep for about 10 real seconds during the night before your vanilla time-since-rest is reset. Briefly entering and leaving a bed is not enough.</p>
<h2>Where it applies</h2><p>Night acceleration applies to the main Overworld. Daytime is not accelerated.</p>
`};

P.spawn={title:'Spawn',section:'Mechanics',summary:'Spawn teleports, death respawns and the protections that matter around spawn.',body:`
<p><code>/spawn</code> teleports to server spawn after the normal teleport warmup. Moving or taking damage cancels it.</p>
<h2>Death respawns</h2><p>Normal deaths currently respawn at server spawn. Sleeping in a bed still sets a bed-spawn location that you can reach with <code>/bed</code>.</p>
<h2>PvP</h2><p>Spawn is protected and does not use normal wilderness PvP rules. Once you leave Spawn and the Warzone, combat is normal unrestricted vanilla PvP.</p>
<h2>Ender Pearls</h2><p>Pearl glitching through protected spawn geometry is blocked. Unsafe/glitching pearl positions are corrected instead of letting the pearl clip you through protected blocks.</p>
<h2>New players</h2><p>First-time players receive a small stone-tool starter kit with food when they join.</p>
`};

P.trivia={title:'Trivia',section:'Mechanics',summary:'Scheduled chat trivia with difficulty-based Raw Gold rewards, stats and leaderboards.',body:`
<p>Trivia asks scheduled questions in chat. Correct answers can give Raw Gold and add to your trivia statistics.</p>
<h2>Playing</h2><p>When a question appears, answer it in chat before someone else gets the correct answer. Reward amounts depend on the question's configured difficulty.</p>
<h2>Stats</h2>${table([
['<code>/trivia stats</code>','View your trivia statistics.'],
['<code>/trivia top</code>','View the trivia leaderboard.']])}
<p>Trivia is a separate activity from Server Events and does not require joining an event arena.</p>
`};

P.giveaways={title:'Giveaways',section:'Mechanics',summary:'Free-entry scheduled giveaways and winner announcements.',body:`
<p>Giveaways are server-wide free-entry prize drawings. When one is active, players can enter without paying an entry fee.</p>
<h2>Joining</h2><p>Use <code>/giveaway</code> during an active giveaway to open or join the current drawing.</p>
<h2>Winner</h2><p>When the giveaway closes, the winner is selected and announced/celebrated by the server.</p>
<p>Giveaways are separate from voting rewards, trivia and Server Events.</p>
`};

P['java-bedrock']={title:'Java & Bedrock',section:'Mechanics',summary:'Joining from either edition and the interface differences that matter on the shared SMP.',body:`
${facts([['Java','enthusia.net'],['Bedrock','enthusia.net · port 19132'],['World','Shared'],['Economy/progression','Shared']])}
<p>Java and Bedrock players play together on the same SMP. Bedrock is not a separate server or separate economy.</p>
<h2>Menus</h2><p>Some systems show Java players an inventory GUI while Bedrock players receive a Bedrock-friendly form. The buttons may look different, but they control the same server data.</p>
<h2>Commands</h2><p>The normal slash commands in this wiki generally work on both editions unless a page explicitly says otherwise.</p>
<h2>AutoClicker</h2><p><a data-page="autoclicker">AutoClicker</a> is server-side, so Bedrock players do not need a Java client mod to use it.</p>
`};

P.leaderboards={title:'Leaderboards',section:'Mechanics',summary:'Where Enthusia ranks balances, playtime, trivia and other public statistics.',body:`
<p>Different systems own different leaderboards. This page is a directory so you can find the statistic you care about without guessing which command or website page controls it.</p>
${table([
['Balance','<code>/baltop [page]</code> — combined wealth leaderboard.'],
['Playtime','<code>/playtime top ...</code> — active, AFK or total time over multiple date ranges.'],
['Reputation','<code>/rep top</code> and <code>/rep bottom</code>.'],
['Trivia','<code>/trivia top</code>.'],
['Death Duels','<code>/stats</code> and duel statistics where available.'],
['Donors/supporters','Public donor/support rankings are displayed through the server website and in-game presentation.']],'Leaderboard|Where to find it')}
<h2>In-game displays</h2><p>Some top statistics are also presented by NPCs around the server, including donor rankings and selected #1 player statistics.</p>
`};

P['history-lore']={title:'History & Lore',section:'Community',summary:'Major wars, alliances, betrayals, eras and other player-made server history.',body:`
<p>This is the community-history side of the wiki: major wars, alliances, betrayals, important eras, notable incidents, guild history and other stories that became part of Enthusia.</p>
<div class="topic-grid">
<a class="topic-card" data-special="players"><b>Player Pages</b><span>players and their individual history</span></a>
<a class="topic-card" data-special="guilds"><b>Guild Pages</b><span>guild identities, members and history</span></a>
${card('betas','Betas','beta-era records, players, guilds and events')}
${card('builds','Builds','important places and community projects')}
<a class="topic-card" data-special="maparts"><b>Mapart</b><span>the existing community mapart collection</span></a>
</div>
<p>Gameplay minigames are documented on <a data-page="events">Server Events</a>, not in server lore unless a particular event later becomes historically important to the community.</p>
`};

P.betas={title:'Betas',section:'Community',summary:'A hub for beta-era players, guilds, builds and major moments.',body:`
<p>This page is for Enthusia's beta-era history: the people, guilds, builds, conflicts and major moments that shaped the server before the permanent SMP.</p>
<p>Existing community-written articles remain the source for those stories. The goal is to link and organize them rather than rewrite them into an official version.</p>
<p>For example, existing guild pages already record beta-era events such as the end fight and EOTW.</p>
`};

P.builds={title:'Builds',section:'Community',summary:'Notable public builds, historical locations and community projects.',body:`
<p>Because Enthusia is a permanent world, places can become part of server history. This page can index notable public builds, market/spawn landmarks, ruins, large community projects and bases or locations that became historically important.</p>
<p>Community-written build pages can be linked here as they are documented.</p>
`};

P.supporters={title:'Supporters & Donors',section:'Mechanics',summary:'How public donor/support rankings are calculated and displayed.',body:`
<p>Public donor rankings are based on completed Tebex payments with a positive amount. Zero-value/manual records and refunded or charged-back payments do not count toward the supporter totals.</p>
<h2>Rankings</h2><p>All-time and monthly top-supporter rankings are available through the public presentation systems. Monthly totals use the server's configured calendar timezone.</p>
<h2>In-game presentation</h2><p>NPC displays can show the top three all-time donors and top three monthly donors, alongside separate #1 displays for selected gameplay statistics such as balance, active playtime and kills.</p>
<p>This page describes public ranking behavior only; store purchases/rank benefits themselves belong on the appropriate <a data-community="Ranks">Ranks</a> or store information.</p>
`};
})();