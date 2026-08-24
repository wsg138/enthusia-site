(()=>{
const P=window.WIKI_V2.pages;
const table=(rows)=>`<table><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
const group=(title,sub,rows)=>`<details class="drop command-drop"><summary><b>${title}</b><span>${sub}</span></summary><div>${table(rows)}</div></details>`;
P.commands={title:'Commands',section:'Reference',summary:'Player commands grouped by purpose, with aliases and related subcommands kept together.',body:`
<p>Open a category to find the command you need. Aliases and closely related variants are grouped together so the page stays searchable without repeating the same action several times.</p>
${group('Getting around','homes, TPA, spawn and bed',[
['<code>/spawn</code>','Teleport to spawn.'],
['<code>/sethome &lt;name&gt;</code>','Set a personal home.'],
['<code>/home [name]</code>','Teleport to a home. Use <code>/homes</code> to view your homes and <code>/delhome &lt;name&gt;</code> to remove one.'],
['<code>/bed</code>','Teleport to your Minecraft bed-spawn location.'],
['<code>/tpa &lt;player&gt;</code>','Ask to teleport to another player.'],
['<code>/tpahere &lt;player&gt;</code>','Ask another player to teleport to you.'],
['<code>/tpaccept [player]</code> / <code>/tpadeny [player]</code>','Accept or deny an incoming request. Common yes/no aliases are also supported by the teleport command set.'],
['<code>/tpacancel</code>','Cancel your outgoing teleport request.'],
['<code>/tpignore &lt;player|list&gt;</code>','Ignore a player\'s TPA requests or view your TPA ignore list.'],
['<code>/tptoggle</code>','Toggle whether you accept normal TPA requests.']
])}
${group('Chat & social','private messages, channels and preferences',[
['<code>/msg &lt;player&gt; &lt;message&gt;</code>','Send a private message. Aliases include <code>/w</code>, <code>/tell</code> and <code>/whisper</code>.'],
['<code>/r &lt;message&gt;</code>','Reply to the player you most recently messaged or who most recently messaged you. Alias: <code>/reply</code>.'],
['<code>/msgtoggle</code>','Toggle private messages.'],
['<code>/ignore &lt;player&gt;</code>','Ignore chat/messages from a player.'],
['<code>/channel</code>','View or change chat channels. Alias: <code>/c</code>.'],
['<code>/chatcolor</code>','Manage your available chat color. Use <code>/colorcodes</code> to view supported codes.'],
['<code>/emoji</code>','View available chat emoji. Alias: <code>/emojis</code>.'],
['<code>/togglesound</code>','Toggle supported chat notification sounds.'],
['<code>/mail</code>','Use the server mail system.'],
['<code>/report</code>','Report a player or problem through the in-game report command.']
])}
${group('Economy & voting','Raw Gold, balances and votes',[
['<code>/balance</code>','Show total wealth, bank balance and physical Raw Gold. Alias: <code>/bal</code>.'],
['<code>/deposit [amount|all]</code>','Deposit a specific amount of physical Raw Gold, or deposit all of it.'],
['<code>/withdraw &lt;amount&gt;</code>','Withdraw bank balance as physical Raw Gold.'],
['<code>/pay &lt;player&gt; &lt;amount&gt;</code>','Pay another player.'],
['<code>/baltop [page]</code>','Open the balance leaderboard.'],
['<code>/vote</code>','Open voting information. Use <code>/votesites</code> to list vote sites.']
])}
${group('Guilds & groups','guild management, homes and group chat',[
['<code>/guild</code>','Open the guild system. Alias: <code>/g</code>.'],
['<code>/guild create &lt;name&gt;</code>','Create a guild.'],
['<code>/guild invite &lt;player&gt;</code>','Invite a player. Rank permissions also control management actions such as kick/promote/demote.'],
['<code>/guild leave</code>','Leave your guild.'],
['<code>/guild sethome [name]</code>','Set a guild home.'],
['<code>/guild home [name]</code>','Teleport to a guild home. Use <code>/guild homes</code> to view them.'],
['<code>/gc &lt;message&gt;</code>','Send guild chat.'],
['<code>/gac &lt;message&gt;</code>','Send ally chat. Alias: <code>/ga</code>.'],
['<code>/partychat</code>','Use party chat. Alias: <code>/pc</code>.'],
['<code>/guildshop</code>','Open guild-aware Market/shop features where available.']
])}
${group('Warzone & Death Duels','PvP information and duel actions',[
['<code>/warzone</code>','Open the Warzone menu.'],
['<code>/warzone info</code>','Show the active Warzone setup.'],
['<code>/warzone modifiers</code>','Show active modifiers; <code>/warzone modifier list</code> browses configured modifiers.'],
['<code>/warzone kit</code> / <code>kits</code>','View the current kit or browse kits.'],
['<code>/warzone items</code>','Show current Warzone item restrictions.'],
['<code>/warzone next</code> / <code>schedule</code>','Show the next rotation change or schedule.'],
['<code>/duel &lt;player&gt;</code>','Challenge a player to a Death Duel.'],
['<code>/duel review</code>','Review an incoming duel, then use <code>/duel accept</code> or <code>/duel deny</code>.'],
['<code>/duel info</code> / <code>settings</code>','View the selected duel rules.'],
['<code>/draw</code>','Request a mutual duel draw.'],
['<code>/vault</code>','Open unclaimed duel spoils. Alias: <code>/duelvault</code>.'],
['<code>/stats</code>','View duel statistics where available.'],
['<code>/bounty</code>','Open or use the server bounty system.']
])}
${group('Playtime, reputation & progression','stats, leaderboards, rewards and cosmetics',[
['<code>/playtime</code>','Open your playtime stats. Alias: <code>/pt</code>.'],
['<code>/playtime top [active|afk|total] [today|7d|30d|all] [page]</code>','Browse filtered playtime leaderboards.'],
['<code>/playtime numerals</code>','Open numeral progression. <code>/roman</code> and <code>/numerals</code> also open numeral information.'],
['<code>/firstjoin [player]</code>','View first-join information. Alias: <code>/fj</code>.'],
['<code>/seen &lt;player&gt;</code>','View last-seen information where available.'],
['<code>/rep [player]</code>','Open your reputation profile or another player\'s profile.'],
['<code>/rep top</code> / <code>bottom</code>','Open reputation leaderboards; <code>/rep reviews [player]</code> shows recent reviews.'],
['<code>/rep stalk &lt;player&gt; [days]</code>','Subscribe to an eligible low-reputation player. Use <code>list</code> or <code>cancel</code> to manage subscriptions.'],
['<code>/tags</code>','Manage unlocked tags.'],
['<code>/rewards</code>','Browse achievements/rewards.'],
['<code>/cosmetics</code>','Manage cosmetics.'],
['<code>/daily</code>','View/claim your daily reward.']
])}
${group('Market','stalls, shops and auctions',[
['<code>/em</code>','Open Enthusia Market commands/menus.'],
['<code>/em auctions</code>','Browse stall auctions.'],
['<code>/em bid &lt;auctionId&gt; &lt;amount&gt;</code>','Bid on a stall auction.'],
['<code>/em stall info &lt;stallId&gt;</code>','Inspect a stall.'],
['<code>/shop search &lt;item&gt;</code>','Search Market shops for an item. Alias: <code>/shopsearch</code>.'],
['<code>/shopvault</code>','Open your Market/shop vault where applicable.'],
['<code>/auctions</code>','Open Market auction information/menu where available.']
])}
${group('Utilities','server information and quality-of-life',[
['<code>/tps</code>','Show accurate TPS and current server information.'],
['<code>/position</code>','Show your current position. Alias: <code>/pos</code>.'],
['<code>/ping</code>','Show your connection ping.'],
['<code>/nextrestart</code>','Show the next planned restart. Alias: <code>/restartschedule</code>.'],
['<code>/scoreboard</code>','Manage your scoreboard where available. Alias: <code>/sb</code>.'],
['<code>/finditem</code>','Use the server item-finding utility.'],
['<code>/offhand</code>','Use the offhand convenience command.'],
['<code>/jukebox</code>','Use the server jukebox utility.'],
['<code>/invisibleitemframes</code>','Use the invisible-item-frame utility. Alias: <code>/itf</code>.'],
['<code>/sit</code> / <code>/lay</code>','Sit or lie down.'],
['<code>/autoclick [ticks]</code>','Toggle AutoClicker or choose a fixed interval; <code>/autoclick status</code> shows its state.'],
['<code>/giveaway</code>','Open/join an active giveaway.'],
['<code>/trivia stats</code> / <code>/trivia top</code>','View trivia stats or the trivia leaderboard.'],
['<code>/rules</code> / <code>/newbie</code>','View server rules or new-player information.'],
['<code>/website</code> / <code>/discord</code> / <code>/store</code>','Get official Enthusia links.'],
['<code>/link</code>','Use Discord-account linking where enabled.'],
['<code>/hub</code>','Return to the network hub.']
])}
${group('Server Events','in development / currently disabled',[
['<code>/event</code>','When Server Events is enabled, this is the main command for event status and subcommands such as join, leave, spectate, vote, start, stats and next.']
])}
<p class="small-note">The command whitelist contains some aliases, compatibility roots and permission-controlled commands that are not ordinary player features. Those are intentionally not listed as separate player commands here.</p>
`};
})();