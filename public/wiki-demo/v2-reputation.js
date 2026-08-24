(()=>{
const P=window.WIKI_V2.pages;
const table=(rows,head='')=>`<table>${head?`<thead><tr>${head.split('|').map(x=>`<th>${x}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const details=(title,subtitle,html)=>`<details class="drop"><summary><b>${title}</b>${subtitle?`<span>${subtitle}</span>`:''}</summary><div>${html}</div></details>`;
const facts=(items)=>`<div class="fact-grid">${items.map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
const list=(items)=>`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
P.reputation={title:'Reputation',section:'Mechanics',summary:'Player reviews, reputation categories, gameplay effects and stalking low-reputation players.',body:`
<p>Reputation records player-to-player reviews. A positive review is worth <strong>+1</strong> and a negative review is worth <strong>-2</strong>.</p>
${facts([['Positive review','+1'],['Negative review','-2'],['Edit/change cooldown','24 hours'],['Reason length','up to 256 characters']])}
<p>You cannot review yourself. Reviews have a category and can include a written reason.</p>
<h2>Categories</h2>${details('Positive categories','open list',table([
['Was Kind','Friendly or considerate behavior.'],['Helped Me','Useful help or support.'],['Gave Items/Money','Fairly gave items or money.'],['Trustworthy','Kept promises and acted reliably.'],['Good Stall','Ran a fair/reliable Market stall.']],'Category|Use'))}
${details('Negative categories','open list',table([
['Scammed','Scammed or deliberately misled another player.'],['Spawn Killed','Killed players unfairly around spawn.'],['Griefed','Damaged or destroyed another player\'s build.'],['Trapped','Used a trap unfairly against another player.'],['Scam Stall','Ran a misleading or dishonest Market stall.']],'Category|Use'))}
<h2>Profiles and commands</h2>${table([
['<code>/rep</code>','Open your reputation profile.'],['<code>/rep &lt;player&gt;</code>','Open another player\'s profile and leave or edit a review.'],['<code>/rep give &lt;player&gt; &lt;category&gt; &lt;reason&gt;</code>','Give reputation directly without using the profile menu.'],['<code>/rep top</code> / <code>bottom</code>','Open reputation leaderboards.'],['<code>/rep reviews [player]</code>','View recent reviews.']])}
<h2>Reputation effects</h2><p>Movement-speed reputation effects are disabled and do not affect players.</p>
${details('Positive effects','current active effects',table([
['+10','+5% beneficial potion duration'],['+15','+10% beneficial potion duration']],'Reputation|Effect'))}
${details('Negative effects','effects added at each threshold',table([
['-6','3s Ender Pearl cooldown; 5% shorter Elytra-rocket duration'],['-7','2s Wind Charge cooldown; rocket penalty increases to 10%'],['-10','Glowing'],['-12','Becomes stalkable; 10% shorter beneficial potion duration'],['-15','Pearl cooldown increases to 7s; Wind Charge cooldown to 5s; rocket penalty to 15%'],['-20','Pearl cooldown increases to 10s; Wind Charge cooldown to 10s; potion penalty to 15%; rocket penalty to 25%; red glow']],'Reputation|Effect added'))}
<p>The Pearl penalty stays at 3 seconds from -6 through -14, becomes 7 seconds at -15, and 10 seconds at -20.</p>
<h2>Where effects apply</h2>${list([
'Glow and beneficial-potion duration effects apply in Spawn and the Warzone.',
'Ender Pearl and Wind Charge reputation cooldowns apply in the Warzone.',
'Elytra-rocket duration penalties apply while gliding.',
'Death Duel participants are exempt from reputation effects that would change the duel rules.'
])}
<h2>Stalking</h2><p>At <strong>-12 or lower</strong>, a player becomes eligible for reputation stalking. A subscription costs <strong>100 per day</strong> for 1–7 days.</p>
<p>Stalking is not live GPS. When the target enters the Warzone from Market, Spawn or Wilderness, an online subscriber receives the target's name and the exact block coordinates where they entered.</p>
${table([
['<code>/rep stalk &lt;player&gt; [days]</code>','Buy a subscription for an eligible player.'],['<code>/rep stalk list</code>','View active subscriptions and remaining time.'],['<code>/rep stalk cancel &lt;player&gt;</code>','Cancel one.']])}
`};
})();
