(()=>{
const P=window.WIKI_V2.pages;
const table=(rows,head='')=>`<table>${head?`<thead><tr>${head.split('|').map(x=>`<th>${x}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const facts=(items)=>`<div class="fact-grid">${items.map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
const details=(title,subtitle,html)=>`<details class="drop"><summary><b>${title}</b>${subtitle?`<span>${subtitle}</span>`:''}</summary><div>${html}</div></details>`;
const list=(items)=>`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;

if(P.mechanics){
  const sleep='<a class="topic-card" data-page="sleep"><b>Sleep</b><span>faster nights and phantom-rest registration</span></a>';
  const spawn='<a class="topic-card" data-page="spawn"><b>Spawn</b><span>death respawns, spawn teleporting and pearl protections</span></a>';
  if(P.mechanics.body.includes(sleep)&&!P.mechanics.body.includes('data-page="spawn"')) P.mechanics.body=P.mechanics.body.replace(sleep,sleep+spawn);
  const java='<a class="topic-card" data-page="java-bedrock"><b>Java & Bedrock</b><span>what is shared and where the interface differs</span></a>';
  const supporters='<a class="topic-card" data-page="supporters"><b>Supporters & Donors</b><span>public supporter rankings and in-game displays</span></a>';
  if(P.mechanics.body.includes(java)&&!P.mechanics.body.includes('data-page="supporters"')) P.mechanics.body=P.mechanics.body.replace(java,java+supporters);
}
if(P.leaderboards&&typeof P.leaderboards.body==='string') P.leaderboards.body=P.leaderboards.body.replace('Public donor/support rankings are displayed through the server website and in-game presentation.','See <a data-page="supporters">Supporters & Donors</a> for public donor/support rankings and in-game displays.');
if(P.events){
  P.events.title='Events';
  if(typeof P.events.body==='string') P.events.body=P.events.body.replace('<div class="status"><b>Server Events is currently in development and is not enabled on the SMP.</b></div>\n','');
}

P.market={title:'Market',section:'Mechanics',summary:'How Enthusia Market stalls, shops, rent, permissions, sales and auctions work.',body:`
<p>The <strong>Market</strong> is Enthusia's protected player-trading area. Players can own stalls, build inside them, create BUY/SELL/TRADE shops, share access, search for items, and sell or auction stall ownership.</p>
<div class="callout"><b>Want the complete Market manual?</b><br>[https://badgersmc.github.io/EnthusiaMarket/ Open the full EnthusiaMarket player wiki]. This page focuses on the rules and procedures most useful on Enthusia.</div>
${facts([['Default stall limit','1 per player'],['Current rent','100 per day'],['Grace period','3 days'],['Shop tax','2%'],['Shop history','30 days'],['Default stall auction','24 hours']])}

<h2>Stalls</h2>
<p>A stall is a protected Market region. The owner can build there, place containers and create shops. Enthusia currently uses a one-owned-stall-per-IP fairness rule in addition to the normal default stall limit.</p>
${details('Stall lifecycle','unowned → owned → grace / sale / auction',table([
['<b>UNOWNED</b>','Available to purchase.'],
['<b>OWNED</b>','Owned by a player or guild; normal rent applies.'],
['<b>GRACE</b>','Rent could not be paid. The stall and its shops freeze while the owner has time to recover it.'],
['<b>AUCTIONING</b> / <b>RE_AUCTIONING</b>','Ownership is being decided by an auction.'],
['<b>EMERGENCY_AUCTIONING</b>','Recovery auction after unpaid rent or another system/admin recovery action.']
],'State|What it means'))}

<h3>Buying a stall</h3>
<p>For an unowned stall, use its purchase sign. Right-click it and choose whether the stall should be owned personally or by your guild. Guild purchases use LumaGuilds permissions and the configured guild payment path.</p>
<p>A stall already listed by its owner can instead be purchased with <code>/em stall buy &lt;stallId&gt;</code>. Open stall auctions are listed with <code>/em auctions</code>.</p>

<h3>Sharing a personal stall</h3>
<p>Stall members are co-owners for the physical stall space. Use these commands when somebody should be able to help build/manage inside your personal stall:</p>
${table([
['<code>/em stall members add &lt;stallId&gt; &lt;player&gt;</code>','Add a player to the stall.'],
['<code>/em stall members remove &lt;stallId&gt; &lt;player&gt;</code>','Remove their stall access.'],
['<code>/em stall members list &lt;stallId&gt;</code>','List the stall members.'],
['<code>/em stall info &lt;stallId&gt;</code>','Show ownership, state, rent and other stall information.']
])}
<p><strong>Stall membership and shop trust are different.</strong> Stall membership controls access to the stall itself; <code>/shop trust</code> controls which individual shops another player may manage.</p>

<h3>Guild-owned stalls</h3>
<p>Guild stalls use <a data-page="guilds">LumaGuilds</a> ranks instead of a separate second guild membership system. Guild leaders can grant Market abilities through guild-rank permissions such as <strong>Manage Shops</strong>, chest access, stock editing and price editing.</p>
<p>[https://badgersmc.github.io/EnthusiaMarket/players/guild-stalls/ Full guild-stall guide]</p>

<h2>Creating a shop</h2>
<div class="callout"><b>Recommended method: blank sign + Shift-left-click.</b></div>
<ol>
<li>Inside a stall you can manage, place a <strong>blank wall sign</strong> on a chest, barrel, shulker box or other supported container.</li>
<li>Hold the item you want the shop to trade in your main hand.</li>
<li><strong>Shift + left-click the sign.</strong></li>
<li>Choose <strong>SELL</strong>, <strong>BUY</strong> or <strong>TRADE</strong>.</li>
<li>Set the amount and price/payment item, then confirm.</li>
</ol>
<p>Bedrock players receive a form instead of the Java inventory GUI. A text-sign fallback also exists: line 1 can be <code>[BUY]</code>, <code>[SELL]</code> or <code>[TRADE]</code>, followed by the amount and price/payment information.</p>
<p>[https://badgersmc.github.io/EnthusiaMarket/players/shop-creation/ Full shop-creation guide]</p>

<h3>Shop types</h3>
${table([
['<b>SELL</b>','You stock the item; customers pay the configured price to buy it.'],
['<b>BUY</b>','Your shop pays players who supply the requested item.'],
['<b>TRADE</b>','Item-for-item barter instead of a normal currency price.']
],'Type|How it works')}

<h2>Managing all of your shops</h2>
<div class="callout"><b>The old ItemShops-style management workflow still exists in EnthusiaMarket.</b> <code>/shop edit</code> opens a GUI containing the shops you own, and there are bulk trust/delete tools.</div>
${table([
['<code>/shop list</code>','List every shop you own with its location/item/price.'],
['<code>/shop edit</code>','Open the owned-shops GUI. Select a shop to edit its amount, price, search visibility or frozen state.'],
['<code>/shop trust &lt;player&gt;</code>','Open the bulk-trust GUI and choose which of your shops that player can manage.'],
['<code>/shop trust &lt;player&gt; all</code>','Trust the player on all of your shops.'],
['<code>/shop untrust &lt;player&gt; [all]</code>','Remove that player from your shops.'],
['<code>/shop delete</code>','Open the delete-shops GUI and choose shops to remove.'],
['<code>/shop delete all</code>','Delete all shops you own if your account has the bulk-delete permission.'],
['<code>/shop breakdelete [duration|off]</code>','Temporarily make breaking one of your shop signs delete its shop record too.'],
['<code>/shop history [page]</code>','View your recent Market shop transactions.'],
['<code>/shop search &lt;item&gt;</code>','Search active Market shops for an item.']
],'Command|What it does')}
<p>A player trusted on a shop may edit that shop, but shop trust does <strong>not</strong> transfer ownership and does not give them the same destructive control as the owner.</p>
<p>[https://badgersmc.github.io/EnthusiaMarket/players/shop-management/ Full shop-management guide]</p>

<h2>Rent, grace and expiration</h2>
<p>Enthusia currently charges a flat <strong>100 per day</strong> per stall. Rent is collected automatically. If it cannot be paid, the stall enters a <strong>3-day grace period</strong> and all shops in it freeze.</p>
${list([
'During grace, the stall is still associated with its owner, but trades are frozen.',
'Paying/extending rent during grace returns the stall to normal operation.',
'If grace expires without recovery, the stall can enter an emergency auction instead of remaining indefinitely occupied.',
'Right-clicking the purchase sign twice within the confirmation window extends rent by one period. The current configuration does not cap prepaid periods.'
])}
<p>Use <code>/em stall info &lt;stallId&gt;</code> or the stall purchase sign to check the current rent state. [https://badgersmc.github.io/EnthusiaMarket/players/rent/ Full rent guide]</p>

<h2>Selling or transferring a stall</h2>
<p>There is no need to hand staff the region manually. Use the Market ownership flows so shops, payments and ownership stay consistent.</p>
${table([
['<code>/em stall offer &lt;stallId&gt; &lt;price&gt;</code>','List the stall for a fixed-price sale.'],
['<code>/em stall offer cancel &lt;stallId&gt;</code>','Cancel your sale offer.'],
['<code>/em stall buy &lt;stallId&gt;</code>','Buy a stall that its owner has listed. Ownership transfers through the Market system.'],
['<code>/em auction start &lt;stallId&gt; &lt;startingPrice&gt; [duration]</code>','Transfer ownership through an auction.'],
['<code>/em sellback &lt;stallId&gt;</code>','Voluntarily give the stall back for the calculated refund; confirm with <code>/em sellback confirm &lt;stallId&gt;</code>.']
])}
<p>Sellback wipes the shops in the stall. A direct sale or completed auction transfers ownership through the Market system instead.</p>

<h2>Stall auctions</h2>
<p>Current stall auctions use a minimum duration of <strong>15 minutes</strong>, default to <strong>24 hours</strong>, and can run for at most <strong>7 days</strong>. The minimum starting bid is <strong>100</strong>. A bid in the final 30 seconds extends the auction by 30 seconds to reduce last-second sniping. The currently configured auction fee is <strong>0%</strong>.</p>
${table([
['<code>/em auctions</code>','Browse active stall auctions.'],
['<code>/em bid &lt;auctionId&gt; &lt;amount&gt;</code>','Place a bid.']
])}

<h2>More Market help</h2>
<p>The dedicated Market wiki goes much deeper into buying/selling, barter vaults, Bedrock behavior, guild stalls, search, limits and auctions:</p>
<p><strong>[https://badgersmc.github.io/EnthusiaMarket/ EnthusiaMarket player wiki]</strong></p>
`};

P.guilds={title:'Guilds',section:'Mechanics',summary:'Enthusia guild membership, ranks, homes, chat, vaults, diplomacy and the established command set.',body:`
<p><strong>Guilds</strong> are Enthusia's main player-group system. A guild has an owner, members, configurable ranks, shared homes, guild/ally chat, a shared vault/bank and relationships with other guilds. Other systems such as the Market use LumaGuilds as the guild identity and rank authority.</p>
<div class="status"><b>Important:</b> LumaGuilds' generic land-claim system is <strong>disabled on Enthusia</strong>. Joining a guild does not create protected wilderness territory.</div>
${facts([['Creation cost','Free'],['Guild name','5–32 characters'],['Maximum members','20'],['Custom ranks','Up to 10'],['Home warmup','3 seconds'],['Home cooldown','5 seconds']])}

<h2>Getting started</h2>
${table([
['<code>/guild</code> / <code>/g</code>','Open/use the guild system.'],
['<code>/g create &lt;name&gt;</code>','Create a guild and become its owner.'],
['<code>/g join &lt;guild&gt;</code>','Join a guild when its invitation/open-join rules allow it.'],
['<code>/g invite &lt;player&gt;</code>','Invite a player if your rank has permission.'],
['<code>/g info [guild]</code>','View guild information.'],
['<code>/g list</code>','Browse guilds.'],
['<code>/g leave</code>','Leave your guild.'],
['<code>/g transfer &lt;player&gt;</code>','Transfer guild ownership to another member.'],
['<code>/g disband</code>','Permanently disband the guild; owner-only/destructive.']
],'Command|Purpose')}
<p>You can only belong to one guild at a time. Ownership is a special single-owner role; use the transfer flow rather than trying to promote a normal rank into ownership.</p>

<h2>Ranks and permissions</h2>
<p>Every member has a guild rank. Ranks control what that member can do: invite/kick members, manage homes, use or manage shared storage, change settings, manage Market shops, and other guild actions.</p>
${table([
['<code>/g ranks</code>','Open rank management.'],
['<code>/g menu</code>','Open the guild control panel; member/rank management is also available here.']
])}
<p>Rank priority matters: a lower-trust rank cannot manage someone who outranks it. Guild owners can create and configure custom ranks rather than giving every member broad access.</p>

<h2>Guild homes</h2>
<p>Guild homes are shared teleport points controlled by guild permissions. The current server uses a <strong>3-second teleport warmup</strong>, <strong>5-second teleport cooldown</strong>, <strong>10-minute set-home cooldown</strong> and safety checks.</p>
${table([
['<code>/g sethome [name]</code>','Set a guild home at your current location if a slot is available and your rank allows it.'],
['<code>/g home [name]</code>','Teleport to the main or named guild home.'],
['<code>/g homes</code>','View the guild homes available to you.'],
['<code>/g removehome &lt;name&gt;</code>','Remove a named guild home with confirmation.'],
['<code>/g setallyhome</code>','Set the separate home intended for allowed allied-guild access.'],
['<code>/g removeallyhome</code>','Remove the ally-home.']
])}
<p>The number of usable home slots can depend on the current guild/runtime state, so the wiki does not hard-code a slot count.</p>

<h2>Guild and ally chat</h2>
${table([
['<code>/g chat</code>','Toggle guild chat. Messages go to your guild until toggled off.'],
['<code>/g allychat</code>','Toggle ally chat for active allied guilds.']
])}
<p>Enthusia's chat plugin handles the final channel formatting/delivery, while LumaGuilds supplies guild membership and active-alliance information.</p>

<h2>Shared vault and bank</h2>
<p>Guilds have shared storage and bank functionality governed by rank permissions. The physical guild-vault chest is enabled and can scale from <strong>9 to 54 slots</strong>.</p>
${table([
['<code>/g vault</code>','Open the shared guild vault when your rank permits it.'],
['<code>/g getvault</code>','Get the special guild-vault chest item when permitted.']
])}
<div class="callout"><b>Raw Gold guild-bank caveat:</b> the current production configuration has an inconsistency between its bank mode and the upstream physical-currency validator. The wiki therefore does not claim that the guild bank's physical Raw Gold path is currently working. The normal <a data-page="raw-gold">Raw Gold</a> player economy is documented separately.</div>

<h2>Diplomacy</h2>
<p>Guilds can maintain relations with other guilds. Alliance/truce requests require the corresponding other side to accept before becoming active; enemy/neutral actions follow their own relation rules.</p>
${table([
['<code>/g ally &lt;guild&gt;</code>','Request or accept an alliance.'],
['<code>/g enemy &lt;guild&gt;</code>','Mark another guild as an enemy.'],
['<code>/g truce &lt;guild&gt;</code>','Propose/accept a truce.'],
['<code>/g neutral &lt;guild&gt;</code>','Clear an existing relation.']
])}

<h2>Market integration</h2>
<p>Guilds can own <a data-page="market">Market</a> stalls. Market access is controlled through guild ranks rather than a duplicate member list. Guild-rank abilities can allow members to manage guild shops, access shop chests, edit stock or modify prices.</p>

${details('Guild command reference','established player-facing commands',table([
['<code>/g create &lt;name&gt;</code>','Create a guild.'],
['<code>/g join &lt;guild&gt;</code>','Join a guild when eligible.'],
['<code>/g invite &lt;player&gt;</code>','Invite a player.'],
['<code>/g kick &lt;player&gt;</code>','Remove a member if your rank permits it.'],
['<code>/g leave</code>','Leave your guild.'],
['<code>/g transfer &lt;player&gt;</code>','Transfer ownership.'],
['<code>/g disband</code>','Disband the guild.'],
['<code>/g info [guild]</code>','View guild information.'],
['<code>/g list</code>','Browse guilds.'],
['<code>/g menu</code>','Open guild management.'],
['<code>/g ranks</code>','Manage ranks/permissions.'],
['<code>/g sethome [name]</code>','Set a guild home.'],
['<code>/g home [name]</code>','Teleport to a guild home.'],
['<code>/g homes</code>','List guild homes.'],
['<code>/g removehome &lt;name&gt;</code>','Remove a guild home.'],
['<code>/g setallyhome</code> / <code>removeallyhome</code>','Manage the separate ally-home.'],
['<code>/g chat</code>','Toggle guild chat.'],
['<code>/g allychat</code>','Toggle ally chat.'],
['<code>/g vault</code>','Open the shared vault.'],
['<code>/g getvault</code>','Get the guild-vault chest item.'],
['<code>/g ally &lt;guild&gt;</code>','Request/accept an alliance.'],
['<code>/g enemy &lt;guild&gt;</code>','Declare an enemy relation.'],
['<code>/g truce &lt;guild&gt;</code>','Request/accept a truce.'],
['<code>/g neutral &lt;guild&gt;</code>','Return a relation to neutral.']
]))}

<div class="small-note"><strong>Update-spoiler boundary:</strong> this page intentionally documents the established production guild feature set only. New dashboard themes, new statistics interfaces, weekly quests and other current LumaGuilds development work are not described here.</div>
`};

if(P.commands&&typeof P.commands.body==='string'){
  P.commands.body=P.commands.body.replace(
    "['<code>/shop search &lt;item&gt;</code>','Search Market shops for an item. Alias: <code>/shopsearch</code>.'],",
    "['<code>/shop list</code> / <code>edit</code>','List your Market shops or open the owned-shops editing GUI.'],\n['<code>/shop trust &lt;player&gt; [all]</code> / <code>untrust</code>','Share or remove management access across your shops.'],\n['<code>/shop delete [all]</code> / <code>breakdelete</code>','Delete selected/all owned shops or use temporary break-delete mode.'],\n['<code>/shop search &lt;item&gt;</code>','Search Market shops for an item. Alias: <code>/shopsearch</code>.'],"
  );
}
})();