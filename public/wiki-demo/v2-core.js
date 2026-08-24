(()=>{
const V=window.WIKI_V2={pages:{},community:{players:'Noteable Players',guilds:'Noteable Guilds',staff:'Staff',maparts:'Maparts'}};
const P=V.pages;
const link=(id,title,desc)=>`<a class="topic-card" data-page="${id}"><b>${title}</b><span>${desc}</span></a>`;
const grid=(items)=>`<div class="topic-grid">${items.join('')}</div>`;
const facts=(items)=>`<div class="fact-grid">${items.map(([a,b])=>`<div><b>${a}</b><span>${b}</span></div>`).join('')}</div>`;
const details=(title,subtitle,html)=>`<details class="drop"><summary><b>${title}</b>${subtitle?`<span>${subtitle}</span>`:''}</summary><div>${html}</div></details>`;
const list=(items)=>`<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
const table=(rows,head='')=>`<table>${head?`<thead><tr>${head.split('|').map(x=>`<th>${x}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

P.mechanics={title:'Mechanics',section:'Mechanics',summary:'The server systems that change how Enthusia plays.',body:`
<p>These are the mechanics players are most likely to need, build around, or look up. Automatic systems are included when they meaningfully change normal survival.</p>
<h2>Survival & bases</h2>${grid([
link('server-information','Server Information','permanent world, no claims, cross-platform access and core survival rules'),
link('piecloak','PieCloak','base privacy, protected entities/block entities and how to build around it'),
link('homes','Homes & Teleportation','TPA, personal homes, bed and spawn travel'),
link('diaries','Diaries','personal diaries, editing, storage rules, protected drops and recovery'),
link('sleep','Sleep','faster nights and phantom-rest registration')])}
<h2>Economy & trading</h2>${grid([
link('raw-gold','Raw Gold','physical currency, bank balances, deposits, withdrawals and payments'),
link('market','Market','stalls, shops, auctions and rent'),
link('voting','Voting','Raw Gold rewards, streak mining boosts and Vote Party'),
link('leaderboards','Leaderboards','balance, playtime, trivia, donor and other public rankings')])}
<h2>PvP</h2>${grid([
link('combat','Combat & PvP','wilderness combat rules and combat-tag restrictions'),
link('warzone','Warzone','rotating kits, modifiers and Warzone-only restrictions'),
link('duels','Death Duels','consensual 1v1s, custom rules, wagers and victor\'s spoils')])}
<h2>Progression & community systems</h2>${grid([
link('guilds','Guilds','groups, ranks, homes, chat, bank, vault and relationships'),
link('playtime','Playtime','active/AFK tracking, leaderboards and numerals'),
link('reputation','Reputation','reviews, reputation effects and stalking'),
link('tags','Tags, Rewards & Cosmetics','achievement rewards, daily rewards, tags and cosmetics'),
link('chat','Chat & Messaging','private messages, channels, guild/ally chat and preferences')])}
<h2>Other player systems</h2>${grid([
link('autoclicker','AutoClicker','server-side stationary hostile-mob farming helper'),
link('trivia','Trivia','scheduled questions, Raw Gold rewards and trivia stats'),
link('giveaways','Giveaways','free-entry scheduled giveaways'),
link('events','Server Events','large event/minigame system currently in development'),
link('java-bedrock','Java & Bedrock','what is shared and where the interface differs')])}
`};

P['server-information']={title:'Server Information',section:'Mechanics',summary:'How Enthusia works as a survival server and the rules that matter before you start.',body:`
<p>Enthusia is a permanent semi-anarchy survival world. The world is meant to last, bases are not protected by land claims, and Java and Bedrock players share the same SMP.</p>
${facts([['Java','enthusia.net'],['Bedrock','enthusia.net · port 19132'],['World','Permanent SMP'],['Land claims','None']])}
<h2>No land claims</h2><div class="callout"><b>Bases can be found, raided and griefed.</b> There are no automatic claim borders protecting your builds.</div>
<p>Location privacy, trust and how much information your base exposes matter. <a data-page="piecloak">PieCloak</a> reduces several client-side base-finding methods, but it does not make a base invulnerable or impossible to find.</p>
<h2>PvP</h2><p><strong>Outside Spawn and the Warzone, combat is unrestricted vanilla PvP.</strong> The normal wilderness does not use Warzone kits or rotating weapon rules.</p>
<p>While combat-tagged, two important restrictions still apply: <strong>you cannot use an Elytra and you cannot log out to escape combat.</strong> The <a data-page="combat">Combat & PvP</a> page explains this separately from the Warzone.</p>
<h2>Economy</h2><p><a data-page="raw-gold">Raw Gold</a> is the server currency. It can exist physically in your inventory or as a bank balance. The <a data-page="market">Market</a> provides protected stalls, shops and auctions for player trading.</p>
<h2>Guilds and community</h2><p><a data-page="guilds">Guilds</a> are the main group system. Community history, notable players and notable guilds are documented separately so gameplay guides do not replace the server's player-written history.</p>
<h2>Useful first commands</h2>${table([
['<code>/rules</code>','View the server rules.'],['<code>/newbie</code>','View new-player information.'],['<code>/tps</code>','Show accurate TPS and current server information.'],['<code>/spawn</code>','Teleport to spawn.'],['<code>/discord</code>','Get the Discord link.'],['<code>/website</code>','Get the website link.'],['<code>/store</code>','Get the store link.']])}
`};

P.combat={title:'Combat & PvP',section:'Mechanics',summary:'The normal wilderness PvP rules, combat tagging, and how Spawn/Warzone differ.',body:`
<div class="callout"><b>Wilderness PvP is vanilla.</b> Outside Spawn and the Warzone, combat is completely unrestricted vanilla combat.</div>
<h2>Wilderness</h2><p>There are no rotating Warzone kits, special weapon cooldowns or Warzone-only item restrictions in ordinary wilderness combat.</p>
<h2>Combat tag</h2><p>When you are in combat, <strong>Elytra use is blocked</strong> and <strong>logging out is not allowed as an escape from combat</strong>. These restrictions follow the combat tag rather than changing normal weapon behavior.</p>
<h2>Spawn</h2><p>Spawn is protected and does not use wilderness PvP rules. See <a data-page="spawn">Spawn</a> for spawn-specific behavior.</p>
<h2>Warzone</h2><p>The <a data-page="warzone">Warzone</a> is the exception: it intentionally rotates kits/modifiers and can change cooldowns or item availability inside that PvP area.</p>
<h2>Death Duels</h2><p><a data-page="duels">Death Duels</a> are consensual 1v1 fights with their own rule builder, optional wagers and victor's-spoils system.</p>
`};

const protectedEntities=['Villager','Copper Golem','Armadillo','Wolf','Cat','Ocelot','Allay','Bee','Iron Golem','Snow Golem','Item Frame','Glow Item Frame','Armor Stand','Painting'];
const protectedBlockGroups=['Campfire / Soul Campfire','Decorated Pot','Bell','Jukebox','Conduit','Beacon','Moving Piston','Shulker Boxes','Signs','Hanging Signs','Banners / Wall Banners','Beds','Heads and Skulls'];
P.piecloak={title:'PieCloak',section:'Mechanics',summary:'How Enthusia reduces ESP, pie-chart and block-entity base finding for hidden bases.',body:`
<p><strong>PieCloak</strong> reduces information exposed to client-side ESP, pie-chart and block-entity base-finding tools when terrain or walls block legitimate visibility. Protected entities and block entities still exist and continue working normally.</p>
<div class="callout"><b>PieCloak helps hide a base. It does not protect a base.</b> Normal exploration can still find it, and somebody who reaches the location can still raid or grief it.</div>
<h2>Visibility distance</h2>${facts([['Within 24 blocks','Protected entities and block entities are always shown.'],['24–48 blocks','Terrain/walls are checked. Three blocking samples are enough to hide a protected entity or block entity.'],['Beyond 48 blocks','Protected entities and block entities stay outside the visibility radius until the player moves closer.'],['Players','Never hidden by PieCloak.']])}
<h2>Building for better privacy</h2>${list([
'Keep protected entities and block entities several solid blocks inside terrain when possible.',
'Avoid placing villagers, shulker boxes, signs, banners, beds or item frames directly against a thin exterior wall.',
'Thicker terrain and entrances with bends are better than a thin shell around a large hollow room.',
'Remember that everything is shown within about 24 blocks. PieCloak is for long-range information leaks, not nearby invisibility.',
'Normal secrecy still matters: avoid obvious entrances, exposed portals, repeated travel trails, shared coordinates and visible surface builds.'
])}
<h2>Protected types</h2>
${details('Protected entities',`${protectedEntities.length} types`,list(protectedEntities))}
${details('Protected block entities',`${protectedBlockGroups.length} groups`,list(protectedBlockGroups))}
<h2>Important limits</h2>${list([
'<strong>Players are not hidden.</strong>',
'<strong>Particles are not hidden by PieCloak.</strong> Particle-producing blocks or activity can still give information to someone deliberately searching for them; Crying Obsidian is one example.',
'PieCloak does not hide an exposed build from normal sight.',
'It does not hide roads, tunnels, maps or coordinates shared by players.',
'It does not prevent normal exploration from finding a base.'
])}
<h2>Does it break farms or villagers?</h2><p>No. Hidden entities still exist normally on the server. Villagers still trade and breed, mobs keep their AI, and farms/block entities continue working.</p>
<h2>Examples</h2><h3>Underground villager hall</h3><p>Villagers 30–40 blocks away and several solid blocks inside a hill can be hidden until the searching player gets a legitimate view or moves close enough.</p>
<h3>Shulker storage</h3><p>Shulker Boxes are protected as one group regardless of color. Putting them behind enough terrain gives them the same PieCloak visibility rules.</p>
<h3>Surface base</h3><p>A clearly visible surface build still looks like a surface build. PieCloak reduces selected client-side information leaks; it is not camouflage.</p>
`};

P['raw-gold']={title:'Raw Gold',section:'Mechanics',summary:'Physical Raw Gold, bank balances, deposits, withdrawals, payments and the balance leaderboard.',body:`
<p>Enthusia's economy is backed by ordinary Minecraft <strong>Raw Gold</strong>. Money can be carried physically or stored in your bank.</p>
${facts([['1 Raw Gold','1 currency'],['1 Raw Gold Block','9 currency'],['Starting bank balance','0'],['Decimals','Not used']])}
<h2>Checking your money</h2>${table([
['<code>/balance</code>','Shows your total wealth, bank balance and physical Raw Gold. Aliases: <code>/bal</code>, <code>/money</code>.'],
['<code>/baltop [page]</code>','Shows the balance leaderboard.']])}
<h2>Depositing and withdrawing</h2>${table([
['<code>/deposit [amount|all]</code>','Deposit a specific amount, or use <code>/deposit</code>/<code>/deposit all</code> to deposit all physical Raw Gold.'],
['<code>/withdraw &lt;amount&gt;</code>','Turn bank balance back into physical Raw Gold.']])}
<h2>Paying another player</h2><p><code>/pay &lt;player&gt; &lt;amount&gt;</code> uses your bank balance first, then physical Raw Gold you are carrying. The recipient receives the payment in their bank balance.</p>
<p>If physical denominations do not match the exact amount cleanly, any necessary overage is returned to your bank rather than simply lost.</p>
<h2>Physical money is still an item</h2><p>Raw Gold in your inventory can be traded, dropped, lost or stolen like other items. Banking it removes that inventory risk.</p>
`};

P.market={title:'Market',section:'Mechanics',summary:'Protected stalls, player shops, auctions, rent and searching for items.',body:`
<p>The Market is Enthusia's protected player-trading area. Players can own stalls, create shops, search for items and bid on stall auctions.</p>
${facts([['Default owned stalls','1 per player'],['Daily stall rent','100'],['Rent grace period','3 days'],['Shop transaction tax','2%'],['Default auction length','24 hours'],['Current auction fee','0%']])}
<h2>Stalls</h2><p>A stall is your protected trading/build space inside the Market. Ownership is limited, and a one-owned-stall-per-IP fairness rule also applies.</p>
<p>Guild-aware permissions can allow other players to help with a stall without making them the owner.</p>
<h2>Shops</h2>${table([
['<b>SELL</b>','You stock an item; customers pay the listed price to buy it.'],
['<b>BUY</b>','The shop pays players who sell the requested item into it.'],
['<b>TRADE</b>','Trades one configured item for another instead of using a normal currency price.']],'Shop type|How it works')}
<p>Use <code>/shop search &lt;item&gt;</code> or <code>/shopsearch</code> to find items being sold in Market shops.</p>
<h2>Rent</h2><p>Rent is currently 100 per day. If it cannot be paid, the stall enters a 3-day grace period and its shops freeze. If the grace period expires, the stall can move into an emergency auction.</p>
<h2>Auctions</h2><p>Stall auctions normally last 24 hours, can range from 15 minutes to 7 days, and have a minimum starting bid of 100. A bid placed in the final 30 seconds extends the auction by 30 seconds so the previous bidder has time to respond.</p>
${details('Useful Market commands','open command list',table([
['<code>/em</code>','Open Market commands/menus.'],['<code>/em auctions</code>','Browse stall auctions.'],['<code>/em bid &lt;auctionId&gt; &lt;amount&gt;</code>','Bid on a stall auction.'],['<code>/em stall info &lt;stallId&gt;</code>','Inspect a stall.'],['<code>/shop search &lt;item&gt;</code>','Search shops for an item. Alias: <code>/shopsearch</code>.'],['<code>/shopvault</code>','Open your Market/shop vault where applicable.']]))}
`};

P.guilds={title:'Guilds',section:'Mechanics',summary:'Player groups with ranks, shared homes, chat, bank, vault and relationships.',body:`
<p>Guilds are player-created groups with their own name, members, ranks, homes, chat, shared money/storage and relationships with other guilds.</p>
${facts([['Creation cost','Free'],['Guild name','5–32 characters'],['Maximum members','20'],['Custom ranks','Up to 10'],['Guild bank maximum','1,000,000'],['Vault size','Can grow to 54 slots']])}
<h2>Creating and managing a guild</h2>${table([
['<code>/guild</code>','Open the guild system. Alias: <code>/g</code>.'],
['<code>/guild create &lt;name&gt;</code>','Create a guild.'],
['<code>/guild invite &lt;player&gt;</code>','Invite a player if your rank allows it.'],
['<code>/guild leave</code>','Leave your guild.'],
['<code>/guild kick/promote/demote ...</code>','Member-management actions available to ranks with the required permission.']])}
<h2>Guild homes</h2><p>Guilds can set named shared homes. Teleporting to a guild home uses a 3-second warmup and 5-second cooldown; setting a guild home has a 10-minute cooldown.</p>
${table([['<code>/guild sethome [name]</code>','Set a shared home.'],['<code>/guild home [name]</code>','Teleport to a shared home your rank can use.'],['<code>/guild homes</code>','List guild homes.'],['<code>/guild removehome &lt;name&gt;</code>','Remove a guild home if your rank allows it.']])}
<h2>Chat</h2><p><code>/gc &lt;message&gt;</code> sends guild chat. <code>/gac &lt;message&gt;</code> sends ally chat; <code>/ga</code> is an alias.</p>
<h2>Bank and vault</h2><p>Guild ranks control who can view/use shared funds and storage. Being a member does not automatically grant management or withdrawal permissions.</p>
<h2>Relationships</h2><p>Guilds can maintain ally, enemy, truce and neutral relationships. Other server systems can use those relationships for chat and guild-aware behavior.</p>
<p>Looking for actual guilds and their history? Open <a data-special="guilds">Guild Pages</a>.</p>
`};

P.homes={title:'Homes & Teleportation',section:'Mechanics',summary:'TPA, personal homes, bed/spawn teleporting and the normal teleport rules.',body:`
<p>Most player teleports use a short warmup. <strong>Moving or taking damage cancels the teleport.</strong> Teleport commands are also unavailable while you are in PvP combat.</p>
<h2>Player teleport requests</h2>${table([
['<code>/tpa &lt;player&gt;</code>','Ask to teleport to another player.'],
['<code>/tpahere &lt;player&gt;</code>','Ask another player to teleport to you.'],
['<code>/tpaccept [player]</code> / <code>/tpadeny [player]</code>','Accept or deny a request.'],
['<code>/tpacancel</code>','Cancel your outgoing request.'],
['<code>/tpignore &lt;player|list&gt;</code>','Ignore a player's TPA requests or view your TPA ignore list.']])}
<p>Requests expire after 60 seconds.</p>
<h2>Personal homes</h2><p>Players start with one home slot. Ranks can increase the limit.</p>
${table([
['<code>/sethome &lt;name&gt;</code>','Save your current location.'],['<code>/home [name]</code>','Teleport to a saved home.'],['<code>/homes</code>','View your homes.'],['<code>/delhome &lt;name&gt;</code>','Delete a home.']])}
<p>If a saved home has become unsafe, the server warns you rather than immediately sending you into danger.</p>
<h2>Bed and spawn</h2><p><code>/bed</code> teleports to your Minecraft bed-spawn location. <code>/spawn</code> teleports to server spawn. Normal deaths currently respawn at server spawn even if you have a bed spawn set.</p>
`};

P.warzone={title:'Warzone',section:'Mechanics',summary:'The Warzone-only rotating kits, modifiers, cooldowns and item rules.',body:`
<div class="callout"><b>These rules apply to the Warzone.</b> Outside Spawn and the Warzone, PvP is normal unrestricted vanilla combat.</div>
<p>The Warzone changes its combat setup on a weekly rotation. Use <code>/warzone</code> to check the current rules instead of assuming the previous week's setup is still active.</p>
<h2>Rotation</h2><ol><li><b>SMP</b></li><li><b>Random modifiers</b></li><li><b>Vanilla</b></li><li><b>Random modifiers</b></li></ol>
<h2>Fixed setups</h2>${details('SMP','Warzone setup',list(['Cobwebs enabled (temporary).','Wind Charge cooldown: 5 seconds.','Ender Pearl cooldown: 5 seconds.','Spear Lunge cooldown: 5 seconds.','Maces disabled.']))}
${details('Mace Nerf','Warzone setup',list(['Successful Mace hit cooldown: 10 seconds.','Spear Lunge cooldown: 5 seconds.']))}
${details('Spear','Warzone setup',list(['Spear damage cooldown: 10 seconds.','Spear Lunge cooldown: 10 seconds.']))}
${details('Vanilla','Warzone setup','<p>No rotating Warzone modifiers are active.</p>')}
<h2>Random weeks</h2><p>Random weeks choose one to three compatible modifiers. Possible changes include cobwebs, disabling/cooling down Maces, Spears, Spear Lunge, Ender Pearls or Wind Charges, and an Elytra mode where gliding is allowed but rocket boosting is disabled.</p>
<h2>End island</h2><p>Maces and Spears are blocked within 1,024 blocks of the center of the main End island. This rule is separate from the weekly Warzone rotation.</p>
${details('Warzone commands','open command list',table([
['<code>/warzone</code>','Open the Warzone menu.'],['<code>/warzone info</code>','Show the active setup.'],['<code>/warzone modifiers</code>','Show active modifiers.'],['<code>/warzone modifier list</code>','Browse modifiers.'],['<code>/warzone kit</code> / <code>kits</code>','View the current kit or browse kits.'],['<code>/warzone items</code>','Show item restrictions.'],['<code>/warzone next</code> / <code>schedule</code>','Show the next change or schedule.']]))}
`};

P.duels={title:'Death Duels',section:'Mechanics',summary:'Consensual 1v1 fights with configurable rules, optional wagers and victor\'s spoils.',body:`
<p>Death Duels are consensual 1v1 fights in a dedicated arena. They are <strong>not keep-inventory duels</strong>: the loser risks the gear they bring.</p>
<h2>Starting a duel</h2><p><code>/duel &lt;player&gt;</code> opens the duel setup. The challenger chooses the rules and the challenged player reviews them before accepting. Requests last 120 seconds.</p>
<h2>Rule options</h2><p>Duels can control building, explosives and combat items such as Ender Pearls, Wind Charges, Maces, Chorus Fruit, Spears, Elytras and Ender Chests. Some items can use duel-specific cooldowns.</p>
<h2>Wagers</h2><p>Each player can wager up to 100,000. The winner receives the combined pot. A mutual draw refunds held wagers.</p>
<h2>Victor's spoils</h2><p>The loser's dropped items are stored for the winner instead of being scattered around the arena. Use <code>/vault</code> to claim them. Unclaimed spoils last 24 hours, and items that do not fit stay in the vault.</p>
<h2>Disconnecting</h2><p>A disconnected player has 30 seconds to reconnect before forfeiting.</p>
<h2>Draws</h2><p><code>/draw</code> requests a mutual draw. The duel only ends as a draw when both players agree.</p>
${details('Useful duel commands','open command list',table([
['<code>/duel &lt;player&gt;</code>','Challenge a player.'],['<code>/duel review</code>','Review an incoming challenge.'],['<code>/duel accept</code> / <code>deny</code>','Accept or deny it.'],['<code>/duel info</code> / <code>settings</code>','View duel rules.'],['<code>/draw</code>','Request a mutual draw.'],['<code>/vault</code>','Claim victor\'s spoils.'],['<code>/stats</code>','View duel statistics where available.']]))}
`};

P.playtime={title:'Playtime',section:'Mechanics',summary:'Total, active and AFK time, leaderboards, first-join history and numeral progression.',body:`
<p>Enthusia separates <strong>total time</strong> from <strong>active time</strong> and <strong>AFK/non-active time</strong>. This keeps active-play leaderboards from simply rewarding leaving Minecraft open.</p>
${facts([['Idle starts','after 60 seconds'],['AFK starts','after 5 minutes'],['Leaderboard ranges','today / 7d / 30d / all'],['Leaderboard metrics','active / AFK / total']])}
<h2>Your stats</h2><p><code>/playtime</code> or <code>/pt</code> opens your playtime information. <code>/playtime top [active|afk|total] [today|7d|30d|all] [page]</code> opens a filtered leaderboard.</p>
<h2>Numerals</h2><p>Active playtime unlocks numeral tiers that can be viewed with <code>/playtime numerals</code>, <code>/roman</code> or <code>/numerals</code>.</p>
${details('Numeral thresholds','active hours',table([
['I','1'],['II','8'],['III','20'],['IV','45'],['V','90'],['VI','170'],['VII','320'],['VIII','580'],['IX','1,090'],['X','2,000'],['Y','5,000'],['Z','15,000']],'Tier|Active hours'))}
<h2>First join and seen</h2><p><code>/firstjoin [player]</code> (alias <code>/fj</code>) shows first-join information. <code>/seen &lt;player&gt;</code> shows last-seen information where available.</p>
`};

P.reputation={title:'Reputation',section:'Mechanics',summary:'Player reviews, reputation categories, gameplay effects and stalking low-reputation players.',body:`
<p>Reputation is a persistent player-review system. Positive entries are worth <strong>+1</strong>; negative entries are worth <strong>-2</strong>.</p>
<p>You cannot review yourself. Changing the same giver/target review has a 24-hour cooldown.</p>
<h2>Review categories</h2>${details('Positive categories','open list',list(['Was Kind','Helped Me','Gave Items/Money','Trustworthy','Good Stall']))}
${details('Negative categories','open list',list(['Scammed','Spawn Killed','Griefed','Trapped','Scam Stall']))}
<h2>Gameplay effects</h2><p>Reputation can affect movement, glow, potion/rocket behavior and some item cooldowns in the areas where reputation effects apply. Death Duels are exempt.</p>
<h2>Stalking</h2><p>Players at <strong>-12 reputation or below</strong> can be stalked. A subscription costs 100 per day for 1–7 days and can alert the subscriber when the target enters the Warzone.</p>
${table([
['<code>/rep [player]</code>','Open your profile or another player\'s profile.'],['<code>/rep top</code> / <code>bottom</code>','Open reputation leaderboards.'],['<code>/rep reviews [player]</code>','View recent reviews.'],['<code>/rep stalk &lt;player&gt; [days]</code>','Buy a stalking subscription for an eligible target.'],['<code>/rep stalk list</code>','View active subscriptions.'],['<code>/rep stalk cancel &lt;player&gt;</code>','Cancel one.']])}
`};

P.tags={title:'Tags, Rewards & Cosmetics',section:'Mechanics',summary:'Achievement rewards, daily streak rewards, tags and cosmetic unlocks.',body:`
<p>The progression menus are <code>/tags</code>, <code>/rewards</code>, <code>/cosmetics</code> and <code>/daily</code>.</p>
<h2>Rewards</h2><p>Achievements cover areas such as playtime, mining, combat, deaths, economy and miscellaneous server activity. Rewards can unlock tags, cosmetics, Raw Gold, items and other player-facing rewards.</p>
<h2>Anti-farming</h2><p>For PvP-kill progression, only the first five credited kills from the same killer against the same victim within a rolling 60-minute window count.</p>
<h2>Daily Raw Gold</h2>${facts([['Day 1','5'],['Day 2','10'],['Day 3','15'],['Day 4','20'],['Day 5','30'],['Day 6','40'],['Day 7+','50 per day']])}
<p>Missing a calendar day resets the next claim to Day 1. Same-IP daily-claim protection exists to limit simple alt farming.</p>
<h2>Cosmetics</h2><p>Cosmetics are grouped by category, with one active cosmetic per category at a time.</p>
`};

P.diaries={title:'Diaries',section:'Mechanics',summary:'Personal first-join diaries, who can edit them, where they can be stored and how protected drops are recovered.',body:`
<p>Every player receives a personal diary when they first join. The diary is a writable collectible tied to its owner, with identifying lore and a unique diary ID.</p>
<h2>Editing and ownership</h2><p>The owner can write in their diary. Other players can hold, trade or collect someone else's diary, but they cannot edit it. Signing the book is disabled so the diary stays writable by its owner.</p>
<h2>Storage rules</h2><p>Diaries are intentionally blocked from storage that would make them easy to lose or duplicate through nested containers.</p>
${details('Blocked storage','open list',list(['Ender Chests','Bundles','Shulker Boxes','Guild vaults','Nested versions of those storage types']))}
<p>Normal containers such as regular chests, barrels and hoppers are allowed.</p>
<h2>Dropped diaries</h2><p>Dropped diaries are protected from fire, lava, explosions, contact damage and normal item despawning.</p>
<h2>Void recovery</h2><p>If a protected diary falls into the void, the system keeps a durable return record and attempts to return it to the player who last dropped it.</p>
<h2>Anvils and grindstones</h2><p>Diaries cannot be modified through anvils or grindstones.</p>
`};

P.voting={title:'Voting',section:'Mechanics',summary:'Vote rewards, daily streaks, temporary mining boosts and Vote Party.',body:`
<p>Voting gives direct Raw Gold and can temporarily increase the Raw Gold you earn from mining gold ore.</p>
<h2>Direct rewards</h2><p>Each configured vote site gives a random <strong>1–10 Raw Gold</strong>. Completing all vote sites gives an additional <strong>20 Raw Gold</strong>.</p>
<h2>Vote streak mining multiplier</h2><p>The streak multiplier applies to extra Raw Gold from mining gold ore for <strong>20 minutes after a qualifying vote</strong>. It does not multiply the direct vote payout.</p>
${facts([['1–2 day streak','1× mining bonus'],['3–6 days','1.5×'],['7–29 days','2×'],['30+ days','3×']])}
<h2>Vote Party</h2><p>A Vote Party triggers at 100 server votes within the configured 30-minute window. During Vote Party, the mining bonus is doubled multiplicatively.</p>
<h2>Commands</h2><p><code>/vote</code> opens voting information. <code>/votesites</code> lists the available vote sites.</p>
`};

P.chat={title:'Chat & Messaging',section:'Mechanics',summary:'Private messages, reply behavior, chat channels, guild/ally chat and player preferences.',body:`
<h2>Private messages</h2>${table([
['<code>/msg &lt;player&gt; &lt;message&gt;</code>','Send a private message. Aliases include <code>/w</code>, <code>/tell</code> and <code>/whisper</code>.'],
['<code>/r &lt;message&gt;</code>','Reply to the player you most recently messaged or who most recently messaged you. Alias: <code>/reply</code>.'],
['<code>/msgtoggle</code>','Toggle private messages.'],
['<code>/ignore &lt;player&gt;</code>','Ignore chat/messages from a player.']])}
<h2>Channels</h2><p><code>/channel</code> (alias <code>/c</code>) handles chat channels. Guild chat uses <code>/gc</code>; ally chat uses <code>/gac</code> or <code>/ga</code>. Temporary party chat uses <code>/partychat</code> or <code>/pc</code>.</p>
<h2>Formatting and preferences</h2>${table([
['<code>/chatcolor</code>','Manage available chat colors.'],['<code>/colorcodes</code>','View supported color codes.'],['<code>/emoji</code> / <code>/emojis</code>','View available emoji.'],['<code>/togglesound</code>','Toggle supported chat notification sounds.']])}
`};

P.events={title:'Server Events',section:'Mechanics',summary:'The large minigame/event system currently in development and the games it is designed to run.',status:'In development — not enabled right now',body:`
<div class="status"><b>Server Events is currently in development and is not enabled on the SMP.</b></div>
<p>When enabled, players join an event, receive event-specific equipment/state, play the selected game, then return to their normal SMP state afterward.</p>
<h2>Implemented event types</h2>
${details('Combat & elimination','SkyWars, BedWars, fights, sumo and more',table([
['<b>SkyWars</b>','Loot your island/mid and eliminate everyone else. Last player alive wins.'],
['<b>BedWars</b>','Protect your bed, collect generator resources, buy items/upgrades and destroy enemy beds. <strong>BedWars uses 1.8-style PvP.</strong>'],
['<b>Fight 1v1</b>','Direct/bracket combat; beat your opponent to advance or win.'],
['<b>Fight 2v2</b>','Two-player teams fight until one team is eliminated. Implemented but not currently planned as an enabled selection.'],
['<b>Fight FFA</b>','Every player for themselves; last survivor wins.'],
['<b>Sumo 1v1</b>','Knock your opponent off the platform first.'],
['<b>Sumo 2v2</b>','Team sumo; knock out the opposing team. Implemented but not currently planned as an enabled selection.'],
['<b>Sumo FFA</b>','Free-for-all sumo; stay on the platform while eliminating everyone else.'],
['<b>Knockback FFA</b>','Knockback-focused free-for-all elimination.'],
['<b>Quake</b>','Fast railgun-style combat; score hits/kills with the event weapon.'],
['<b>One in the Chamber</b>','Projectile combat with limited shots and continuing respawns/score.']],'Event|How to play'))}
${details('Team objectives','capture games',table([
['<b>Capture the Flag</b>','Take the enemy flag and return it while protecting your own. The implemented target is three captures.'],
['<b>Capture Players</b>','Capture/carry enemy players into your jail area while rescuing teammates.']],'Event|How to play'))}
${details('Party & survival','block party, hot potato, spleef and more',table([
['<b>Block Party</b>','Move onto the announced concrete color before the other colors disappear.'],
['<b>Hot Potato</b>','Pass the potato before its timer eliminates you.'],
['<b>Spleef</b>','Break the floor under other players without falling yourself.'],
['<b>Splegg</b>','Projectile Spleef: shoot floor blocks to make other players fall.'],
['<b>Red Light Green Light</b>','Move on green, stop on red, and reach the finish without being caught moving.']],'Event|How to play'))}
${details('Races & completion','boat, horse, Elytra and parkour',table([
['<b>Boat Race</b>','Race the boat course and finish first.'],
['<b>Horse Race</b>','Race the configured course on horseback.'],
['<b>Elytra Race</b>','Fly through required rings/checkpoints in order and finish first.'],
['<b>Parkour</b>','Complete the course/checkpoints in order; finish placement decides the result.']],'Event|How to play'))}
<h2>Commands when Events returns</h2>${details('Event commands','open list',table([
['<code>/event</code>','Show the event/status.'],['<code>/event join</code> / <code>leave</code>','Join or leave the current event.'],['<code>/event spectate</code>','Spectate where supported.'],['<code>/event vote</code>','Open event voting.'],['<code>/event start</code>','Open/select player-startable events where permitted.'],['<code>/event stats</code>','Open event statistics.'],['<code>/event next</code>','Show the next scheduled event-vote time when scheduling is enabled.']]))}
<h2>KOTH</h2><p>KOTH is a separate system and is currently disabled.</p>
`};
})();