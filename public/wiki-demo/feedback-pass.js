(()=>{
const P=window.WIKI_DEMO_DATA.pages;

if(P.mechanics) P.mechanics.group='Mechanics';

if(P.events&&typeof P.events.body==='string'){
  P.events.body=P.events.body.replace(/<div class="fact-grid"><div><b>Join phase<\/b>[\s\S]*?Those values only matter once Server Events is enabled\.<\/p>/,'<p>When Server Events is enabled, players get a short join and countdown period before the game begins.</p>');
  P.events.body=P.events.body.replace(/<h2>BedWars details<\/h2><p>[\s\S]*?<\/p>/,'');
  if(!P.events.body.includes('1.8-style PvP')){
    P.events.body=P.events.body.replace('Protect your team\'s bed, gather generator resources, buy items and upgrades, and destroy enemy beds.','Protect your team\'s bed, gather generator resources, buy items and upgrades, and destroy enemy beds. <strong>BedWars uses 1.8-style PvP.</strong>');
  }
}

P.commands={title:'Commands',group:'Reference',summary:'Player commands grouped by system, with aliases and closely related variants kept together.',body:`
<p>Commands are grouped by what they do. Aliases and closely related subcommands are kept in the same entry instead of being repeated as separate rows.</p>
<details class="command-group"><summary><b>Getting around</b><span>homes, TPA, spawn and bed</span></summary><div><table>
<tr><td><code>/spawn</code></td><td>Teleport to spawn.</td></tr>
<tr><td><code>/sethome &lt;name&gt;</code></td><td>Set a personal home.</td></tr>
<tr><td><code>/home [name]</code></td><td>Teleport to a home. Use <code>/homes</code> to view your homes and <code>/delhome &lt;name&gt;</code> to remove one.</td></tr>
<tr><td><code>/bed</code></td><td>Teleport to your bed spawn.</td></tr>
<tr><td><code>/tpa &lt;player&gt;</code></td><td>Ask to teleport to another player.</td></tr>
<tr><td><code>/tpahere &lt;player&gt;</code></td><td>Ask another player to teleport to you.</td></tr>
<tr><td><code>/tpaccept [player]</code> / <code>/tpadeny [player]</code></td><td>Accept or deny an incoming request. Use <code>/tpacancel</code> to cancel your outgoing request.</td></tr>
<tr><td><code>/tpignore &lt;player|list&gt;</code></td><td>Ignore a player's TPA requests or view your ignore list.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Chat & social</b><span>messages, channels and chat preferences</span></summary><div><table>
<tr><td><code>/msg &lt;player&gt; &lt;message&gt;</code></td><td>Send a private message. Aliases: <code>/w</code>, <code>/tell</code>, <code>/whisper</code>.</td></tr>
<tr><td><code>/r &lt;message&gt;</code></td><td>Reply to your most recent private-message conversation. Alias: <code>/reply</code>.</td></tr>
<tr><td><code>/msgtoggle</code></td><td>Toggle private messages.</td></tr>
<tr><td><code>/ignore &lt;player&gt;</code></td><td>Ignore chat/messages from a player.</td></tr>
<tr><td><code>/channel</code></td><td>View or change chat channels. Alias: <code>/c</code>.</td></tr>
<tr><td><code>/chatcolor</code></td><td>Manage your available chat colors. Use <code>/colorcodes</code> to view supported codes.</td></tr>
<tr><td><code>/emoji</code></td><td>View available chat emoji. Alias: <code>/emojis</code>.</td></tr>
<tr><td><code>/togglesound</code></td><td>Toggle supported chat notification sounds.</td></tr>
<tr><td><code>/mail</code></td><td>Use the server mail system.</td></tr>
<tr><td><code>/report</code></td><td>Report a player or problem.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Economy & voting</b><span>Raw Gold, balances and votes</span></summary><div><table>
<tr><td><code>/balance</code></td><td>Show your total wealth, bank balance and physical Raw Gold. Aliases: <code>/bal</code>, <code>/money</code>.</td></tr>
<tr><td><code>/deposit [amount|all]</code></td><td>Deposit a specific amount of physical Raw Gold. Use <code>/deposit</code> or <code>/deposit all</code> to deposit everything.</td></tr>
<tr><td><code>/withdraw &lt;amount&gt;</code></td><td>Withdraw bank balance as physical Raw Gold.</td></tr>
<tr><td><code>/pay &lt;player&gt; &lt;amount&gt;</code></td><td>Pay another player.</td></tr>
<tr><td><code>/baltop [page]</code></td><td>Open the balance leaderboard.</td></tr>
<tr><td><code>/vote</code></td><td>Open voting information. Use <code>/votesites</code> to list the available vote sites.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Guilds & parties</b><span>guild management and group chat</span></summary><div><table>
<tr><td><code>/guild</code></td><td>Open the guild system. Alias: <code>/g</code>.</td></tr>
<tr><td><code>/guild create &lt;name&gt;</code></td><td>Create a guild.</td></tr>
<tr><td><code>/guild invite &lt;player&gt;</code></td><td>Invite a player. Guild leaders/ranks can also use <code>kick</code>, <code>promote</code> and <code>demote</code> where permitted.</td></tr>
<tr><td><code>/guild leave</code></td><td>Leave your guild.</td></tr>
<tr><td><code>/guild sethome [name]</code></td><td>Set a guild home.</td></tr>
<tr><td><code>/guild home [name]</code></td><td>Teleport to a guild home. Use <code>/guild homes</code> to view them.</td></tr>
<tr><td><code>/gc &lt;message&gt;</code></td><td>Send guild chat.</td></tr>
<tr><td><code>/gac &lt;message&gt;</code></td><td>Send ally chat. Alias: <code>/ga</code>.</td></tr>
<tr><td><code>/partychat</code></td><td>Use party chat. Alias: <code>/pc</code>.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Warzone & PvP</b><span>Warzone rules, duels and bounties</span></summary><div><table>
<tr><td><code>/warzone</code></td><td>Open the Warzone menu. Subcommands such as <code>info</code>, <code>modifiers</code>, <code>kits</code>, <code>items</code>, <code>next</code> and <code>schedule</code> open specific Warzone information.</td></tr>
<tr><td><code>/duel &lt;player&gt;</code></td><td>Challenge a player to a Death Duel.</td></tr>
<tr><td><code>/duel review</code></td><td>Review an incoming challenge, then use <code>/duel accept</code> or <code>/duel deny</code>.</td></tr>
<tr><td><code>/duel info</code></td><td>View the current duel rules. Alias/variant: <code>/duel settings</code>.</td></tr>
<tr><td><code>/draw</code></td><td>Request a mutual duel draw.</td></tr>
<tr><td><code>/vault</code></td><td>Open unclaimed duel spoils. Alias: <code>/duelvault</code>.</td></tr>
<tr><td><code>/stats</code></td><td>View duel statistics where available.</td></tr>
<tr><td><code>/bounty</code></td><td>Open or use the server bounty system.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Playtime, reputation & progression</b><span>statistics, rewards, tags and cosmetics</span></summary><div><table>
<tr><td><code>/playtime</code></td><td>Open your playtime statistics. Alias: <code>/pt</code>. Use <code>/playtime top ...</code> for leaderboards and <code>/playtime numerals</code> for numeral progression.</td></tr>
<tr><td><code>/roman</code> / <code>/numerals</code></td><td>Open numeral progression directly.</td></tr>
<tr><td><code>/firstjoin [player]</code></td><td>View first-join information. Alias: <code>/fj</code>.</td></tr>
<tr><td><code>/seen &lt;player&gt;</code></td><td>View last-seen information where available.</td></tr>
<tr><td><code>/rep [player]</code></td><td>Open your reputation profile or another player's profile.</td></tr>
<tr><td><code>/rep top</code> / <code>/rep bottom</code></td><td>Open reputation leaderboards. Use <code>/rep reviews [player]</code> for recent reviews.</td></tr>
<tr><td><code>/rep stalk &lt;player&gt; [days]</code></td><td>Subscribe to an eligible low-reputation player. Use <code>list</code> to view subscriptions and <code>cancel &lt;player&gt;</code> to remove one.</td></tr>
<tr><td><code>/tags</code></td><td>Equip or clear unlocked tags.</td></tr>
<tr><td><code>/rewards</code></td><td>Browse achievements and rewards.</td></tr>
<tr><td><code>/cosmetics</code></td><td>Manage unlocked cosmetics.</td></tr>
<tr><td><code>/daily</code></td><td>Claim or view your daily reward.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Market</b><span>stalls, shops and auctions</span></summary><div><table>
<tr><td><code>/em</code></td><td>Open Enthusia Market. Important subcommands include <code>auctions</code>, <code>bid</code> and <code>stall info</code>.</td></tr>
<tr><td><code>/shop search &lt;item&gt;</code></td><td>Search Market shops for an item. Alias: <code>/shopsearch</code>.</td></tr>
<tr><td><code>/shopvault</code></td><td>Open the Market/shop vault where applicable.</td></tr>
<tr><td><code>/auctions</code></td><td>Open Market auction information/menu where available.</td></tr>
<tr><td><code>/guildshop</code></td><td>Use guild-market shop features where available.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Utilities & server</b><span>server info and quality-of-life commands</span></summary><div><table>
<tr><td><code>/tps</code></td><td>Show accurate TPS and current server information.</td></tr>
<tr><td><code>/position</code></td><td>Show your current position. Alias: <code>/pos</code>.</td></tr>
<tr><td><code>/ping</code></td><td>Show your connection ping.</td></tr>
<tr><td><code>/nextrestart</code></td><td>View the next planned server restart. Alias: <code>/restartschedule</code>.</td></tr>
<tr><td><code>/scoreboard</code></td><td>Manage your scoreboard where available. Alias: <code>/sb</code>.</td></tr>
<tr><td><code>/finditem</code></td><td>Use the server item-finding utility.</td></tr>
<tr><td><code>/offhand</code></td><td>Use the offhand convenience command.</td></tr>
<tr><td><code>/jukebox</code></td><td>Use the server jukebox utility.</td></tr>
<tr><td><code>/invisibleitemframes</code></td><td>Use the invisible-item-frame utility. Alias: <code>/itf</code>.</td></tr>
<tr><td><code>/sit</code> / <code>/lay</code></td><td>Sit or lie down.</td></tr>
<tr><td><code>/autoclick [ticks]</code></td><td>Toggle the server-side AutoClicker or set a fixed interval. Use <code>/autoclick status</code> to view its state.</td></tr>
<tr><td><code>/giveaway</code></td><td>Open an active giveaway.</td></tr>
<tr><td><code>/trivia stats</code> / <code>/trivia top</code></td><td>View your trivia stats or the trivia leaderboard.</td></tr>
<tr><td><code>/rules</code> / <code>/newbie</code></td><td>View server rules or new-player information.</td></tr>
<tr><td><code>/website</code> / <code>/discord</code> / <code>/store</code></td><td>Get the official Enthusia links.</td></tr>
<tr><td><code>/link</code></td><td>Use Discord-account linking where enabled.</td></tr>
<tr><td><code>/hub</code></td><td>Return to the network hub.</td></tr>
</table></div></details>

<details class="command-group"><summary><b>Server Events</b><span>currently in development</span></summary><div><table>
<tr><td><code>/event</code></td><td>When Server Events is enabled, this command handles status plus subcommands such as <code>join</code>, <code>leave</code>, <code>spectate</code>, <code>vote</code>, <code>start</code>, <code>stats</code> and <code>next</code>. The system is currently not enabled on the SMP.</td></tr>
</table></div></details>
`};
})();
