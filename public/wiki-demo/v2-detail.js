(()=>{
const P=window.WIKI_V2.pages;
const facts=(items)=>`<div class="fact-grid">${items.map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
const details=(title,subtitle,html)=>`<details class="drop"><summary><b>${title}</b>${subtitle?`<span>${subtitle}</span>`:''}</summary><div>${html}</div></details>`;
const table=(rows,head='')=>`<table>${head?`<thead><tr>${head.split('|').map(x=>`<th>${x}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const list=(items)=>`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;

P.reputation={title:'Reputation',section:'Mechanics',summary:'Player reviews, reputation categories, gameplay effects and stalking low-reputation players.',body:`
<p>Reputation records player-to-player reviews. A positive review is worth <strong>+1</strong> and a negative review is worth <strong>-2</strong>.</p>
${facts([['Positive review','+1'],['Negative review','-2'],['Edit/change cooldown','24 hours'],['Reason length','up to 256 characters']])}
<p>You cannot review yourself. Reviews have a category and can include a written reason.</p>
<h2>Categories</h2>${details('Positive categories','open list',table([
['Was Kind','Friendly or considerate behavior.'],['Helped Me','Useful help or support.'],['Gave Items/Money','Fairly gave items or money.'],['Trustworthy','Kept promises and acted reliably.'],['Good Stall','Ran a fair/reliable Market stall.']],'Category|Use'))}
${details('Negative categories','open list',table([
['Scammed','Scammed or deliberately misled another player.'],['Spawn Killed','Killed players unfairly around spawn.'],['Griefed','Damaged/destroyed another player\'s build.'],['Trapped','Used a trap unfairly against another player.'],['Scam Stall','Ran a misleading/dishonest Market stall.']],'Category|Use'))}
<h2>Profiles and commands</h2>${table([
['<code>/rep</code>','Open your reputation profile.'],['<code>/rep &lt;player&gt;</code>','Open another player\'s profile and leave/edit a review.'],['<code>/rep give &lt;player&gt; &lt;category&gt; &lt;reason&gt;</code>','Give reputation directly without using the profile menu.'],['<code>/rep top</code> / <code>bottom</code>','Open reputation leaderboards.'],['<code>/rep reviews [player]</code>','View recent reviews.']])}
<h2>Reputation effects</h2><p>Reputation can change gameplay at certain scores. Open the lists below for the current effects.</p>
${details('Positive effects','+5 to +15',table([
['+5','+1% movement speed'],['+10','+3% movement speed; +5% potion duration'],['+15','+5% movement speed; +10% potion duration']],'Reputation|Effects'))}
${details('Negative effects','-5 to -20',table([
['-5','-1% movement speed'],['-6','3s Ender Pearl cooldown; -5% Elytra-rocket flight duration'],['-7','-3% movement speed; 2s Wind Charge cooldown; -10% rocket duration'],['-10','-5% movement speed; 5s Ender Pearl cooldown; glowing'],['-12','Becomes stalkable; -10% potion duration'],['-15','7s Ender Pearl cooldown; 5s Wind Charge cooldown; -15% rocket duration'],['-20','10s Pearl cooldown; 10s Wind Charge cooldown; -10% movement speed; -15% potion duration; -25% rocket duration; red glow']],'Reputation|Effects'))}
<h2>Where effects apply</h2>${list([
'Movement-speed and glow effects apply in Spawn/Warzone effect areas.',
'Potion-duration modifiers apply in Spawn or the Warzone.',
'Ender Pearl and Wind Charge reputation cooldowns apply in the Warzone.',
'Death Duel participants are exempt from reputation effects that would change the duel rules.'
])}
<h2>Stalking</h2><p>At <strong>-12 or lower</strong>, a player becomes eligible for reputation stalking. A subscription costs <strong>100 per day</strong> for 1–7 days.</p>
<p>Stalking is not live GPS. When the target genuinely enters the Warzone from Market, Spawn or Wilderness, an online subscriber receives the target's name and the exact block coordinates where they entered.</p>
${table([
['<code>/rep stalk &lt;player&gt; [days]</code>','Buy a subscription for an eligible player.'],['<code>/rep stalk list</code>','View active subscriptions and remaining time.'],['<code>/rep stalk cancel &lt;player&gt;</code>','Cancel one.']])}
`};

P.tags={title:'Tags, Rewards & Cosmetics',section:'Mechanics',summary:'Achievement rewards, daily rewards, tags and unlockable cosmetics.',body:`
<p><code>/tags</code>, <code>/rewards</code>, <code>/cosmetics</code> and <code>/daily</code> are the main progression menus.</p>
<h2>Tags</h2><p><code>/tags</code> shows the tags you own. Click one to equip it; only one tag can be selected at a time. The menu also lets you clear your current tag.</p>
<h2>Achievements and rewards</h2><p>The reward catalog contains roughly 100 achievements across <strong>Playtime, Mining, Combat, Deaths, Economy and Misc</strong>.</p>
<p>Rewards can give tags, Raw Gold, Minecraft items, cosmetics/permission unlocks and other configured rewards.</p>
${details('Example rewards','a few examples',table([
['Trail Starter','Walk 20,000 blocks → trail cosmetic.'],['First Blood FX','10 player kills → kill effect.'],['Arrow Flair','50 projectile hits → projectile cosmetic.'],['GG Messages','5 player kills → kill-message cosmetic.'],['Block Game Addict','24 active-playtime hours → tag + 500 Raw Gold.'],['Payday','5 total-playtime hours → 150 Raw Gold.'],['Starter Pack','Mine 250 stone → 2 Golden Apples.'],['High Roller','Hold 100,000 currency → tag + 500 Raw Gold.'],['Market Access','10 total-playtime hours → Market-stall access.'],['Reputation Unlocked','5 active-playtime hours → reputation access.']],'Reward|Requirement / reward'))}
<h2>How progress is counted</h2><p>Different rewards can use active playtime, total playtime, consecutive active time or active time underground as separate requirements.</p>
<p>Mining achievements that require natural resources do not let you repeatedly place and re-mine the same tracked ore/block for progress.</p>
<h2>PvP anti-farming</h2><p>Only the first <strong>five qualifying kills</strong> from the same killer against the same victim in a rolling <strong>60-minute</strong> window count toward PvP achievement progress.</p>
<h2>Daily rewards</h2>${facts([['Day 1','5 Raw Gold'],['Day 2','10'],['Day 3','15'],['Day 4','20'],['Day 5','30'],['Day 6','40'],['Day 7+','50 per day']])}
<p>Missing a calendar day resets the next claim to Day 1. Normal daily claiming is also limited per shared IP each day, with staff-managed household exceptions where appropriate.</p>
<h2>Cosmetics</h2><p><code>/cosmetics</code> lets you select unlocked cosmetics. One cosmetic can be active in each category at a time; selecting the active one again turns that category off.</p>
${details('Cosmetic categories','open list',list(['Projectiles','Kill Messages','Kill Effects','Death Effects','Trails','Join Messages','Quit Messages','Misc']))}
<p>Locked cosmetics remain visible but cannot be selected until you earn the required unlock.</p>
`};

if(P.mechanics) P.mechanics.body=P.mechanics.body.replace('<p>These are the mechanics players are most likely to need, build around, or look up. Automatic systems are included when they meaningfully change normal survival.</p>','<p>Enthusia adds systems for base privacy, travel, trading, PvP, progression and community play. Major mechanics have their own pages below.</p>');

if(P['server-information']) P['server-information'].body=P['server-information'].body.replace('<p><a data-page="guilds">Guilds</a> are the main group system. Community history, notable players and notable guilds are documented separately so gameplay guides do not replace the server\'s player-written history.</p>','<p><a data-page="guilds">Guilds</a> are the main group system. You can also browse <a data-special="players">Player Pages</a>, <a data-special="guilds">Guild Pages</a> and <a data-page="history-lore">History & Lore</a>.</p>');

if(P.betas) P.betas.body=`<p>This page covers Enthusia's beta-era history: players, guilds, builds, conflicts and major moments from before the permanent SMP.</p><p>Existing guild and player articles already record beta-era events such as the end fight and EOTW. As more beta history is documented, those articles can be linked here.</p>`;

if(P.leaderboards) P.leaderboards.body=P.leaderboards.body.replace('<p>Different systems own different leaderboards. This page is a directory so you can find the statistic you care about without guessing which command or website page controls it.</p>','<p>Enthusia has several public leaderboards. Use the table below to find the one you want.</p>');

if(P.supporters) P.supporters.body=P.supporters.body.replace('<p>This page describes public ranking behavior only; store purchases/rank benefits themselves belong on the appropriate <a data-community="Ranks">Ranks</a> or store information.</p>','<p>For rank benefits, see <a data-community="Ranks">Ranks</a> or the official store.</p>');

if(P.commands) P.commands.body=P.commands.body.replace(/<p class="small-note">[\s\S]*?<\/p>/,'');
})();