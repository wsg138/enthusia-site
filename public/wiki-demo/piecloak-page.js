(()=>{
const P=window.WIKI_DEMO_DATA.pages;
const colors=['White','Orange','Magenta','Light Blue','Yellow','Lime','Pink','Gray','Light Gray','Cyan','Purple','Blue','Brown','Green','Red','Black'];
const woods=['Oak','Spruce','Birch','Jungle','Acacia','Dark Oak','Mangrove','Cherry','Bamboo','Crimson','Warped','Pale Oak'];
const list=items=>`<ul class="dense-list">${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
const shulkers=['Shulker Box',...colors.map(c=>`${c} Shulker Box`)];
const signs=woods.flatMap(w=>[`${w} Sign`,`${w} Wall Sign`]);
const hangingSigns=woods.flatMap(w=>[`${w} Hanging Sign`,`${w} Wall Hanging Sign`]);
const banners=colors.flatMap(c=>[`${c} Banner`,`${c} Wall Banner`]);
const beds=colors.map(c=>`${c} Bed`);
const heads=['Skeleton Skull','Skeleton Wall Skull','Wither Skeleton Skull','Wither Skeleton Wall Skull','Zombie Head','Zombie Wall Head','Player Head','Player Wall Head','Creeper Head','Creeper Wall Head','Dragon Head','Dragon Wall Head','Piglin Head','Piglin Wall Head'];
const entities=['Villager','Copper Golem','Armadillo','Wolf','Cat','Ocelot','Allay','Bee','Iron Golem','Snow Golem','Item Frame','Glow Item Frame','Armor Stand','Painting'];
const directBlocks=['Campfire','Soul Campfire','Decorated Pot','Bell','Jukebox','Conduit','Beacon','Moving Piston'];
P.piecloak={title:'PieCloak',group:'Gameplay',summary:'How Enthusia hides selected entities and block entities behind terrain to reduce ESP and pie-chart base finding.',body:`
<p><strong>PieCloak</strong> is Enthusia's base-privacy system. It reduces information sent to a player's client about selected entities and block entities when terrain or walls block legitimate visibility. The entities and blocks still exist and continue working normally on the server.</p>
<p>Because Enthusia has no land claims, keeping a base hidden is mostly about location secrecy. Some client-side ESP, debug and pie-chart methods can use entity or block-entity information to narrow down where activity exists even when the player cannot actually see the base. PieCloak removes much of that information for the specific types listed below.</p>
<div class="callout"><b>PieCloak helps hide a base. It does not protect a base.</b> If somebody reaches the location normally, PieCloak does not stop them from seeing, entering, raiding or griefing it.</div>
<h2>How visibility works</h2>
<div class="fact-grid"><div><b>Within 24 blocks</b><span>Protected entities and block entities are always shown.</span></div><div><b>24–48 blocks</b><span>Terrain and walls are checked. Three blocking samples along the view are enough to hide a protected type.</span></div><div><b>Beyond 48 blocks</b><span>Protected types remain outside the visibility radius until the player moves closer.</span></div><div><b>Players</b><span>Players are never hidden by PieCloak.</span></div></div>
<p>The middle distance is where base construction matters most. A villager or shulker box several blocks inside a hill is much more likely to stay hidden than the same thing placed directly against a one-block exterior wall.</p>
<h2>How to build around PieCloak</h2>
<ul><li>Keep villagers, pets, golems, shulker boxes, signs, banners, beds, item frames and other protected types <strong>several solid blocks inside terrain</strong> where possible.</li><li>Avoid placing important protected block entities directly against the outside wall of a hidden base.</li><li>Natural terrain, thicker walls and routes with bends are better than a thin shell around a large hollow room.</li><li>Remember the 24-block always-visible range. PieCloak is meant to stop long-range information leaks, not hide a base from someone who is already standing beside it.</li><li>Do not rely on PieCloak for containers or block entities that are not listed below. A hidden base can still reveal itself through an unprotected type.</li><li>Use normal secrecy too: avoid obvious surface entrances, repeated travel trails, exposed Nether portals, shared coordinates, public maps and visible builds.</li></ul>
<h2>Protected entities</h2>
<p>These entity types are currently managed by PieCloak. Other mobs and players are not automatically hidden.</p>
<details class="info-drop"><summary><b>Show all protected entities</b><span>${entities.length} entity types</span></summary><div>${list(entities)}</div></details>
<h2>Protected block entities</h2>
<p>PieCloak protects the direct block entities below plus complete groups such as every shulker-box color, sign wood type, banner color and bed color.</p>
<details class="info-drop"><summary><b>Directly protected block entities</b><span>Campfires, bells, beacons and more</span></summary><div>${list(directBlocks)}</div></details>
<details class="info-drop"><summary><b>Shulker boxes</b><span>All current colors</span></summary><div>${list(shulkers)}</div></details>
<details class="info-drop"><summary><b>Signs</b><span>Standing and wall signs for every current wood type</span></summary><div>${list(signs)}</div></details>
<details class="info-drop"><summary><b>Hanging signs</b><span>Hanging and wall-hanging signs for every current wood type</span></summary><div>${list(hangingSigns)}</div></details>
<details class="info-drop"><summary><b>Banners</b><span>Every color, including wall banners</span></summary><div>${list(banners)}</div></details>
<details class="info-drop"><summary><b>Beds</b><span>Every color</span></summary><div>${list(beds)}</div></details>
<details class="info-drop"><summary><b>Heads and skulls</b><span>Floor and wall variants</span></summary><div>${list(heads)}</div></details>
<h2>Common things PieCloak does not hide</h2>
<p>PieCloak uses a specific allowlist. If something is not on that list, it is not protected just because it is inside a base.</p>
<details class="info-drop"><summary><b>Common unprotected examples</b><span>Important when designing a hidden base</span></summary><div>${list(['Players','Ordinary terrain and building blocks','Ores','Most mobs not listed above','Chests','Trapped Chests','Barrels','Hoppers','Furnaces','Smokers','Blast Furnaces','Dispensers','Droppers','Brewing Stands','Ender Chests','Spawners','Lecterns','Beehives','Bee Nests'])}</div></details>
<p>This does not mean every unprotected block entity automatically reveals a base in every client or tool. It means PieCloak does not specifically hide that type, so it should not be treated as protected.</p>
<h2>What PieCloak does not change</h2>
<ul><li>It does not hide players.</li><li>It does not hide ordinary blocks, ores or an entire chunk.</li><li>It does not stop mob AI, villager trading, breeding, farms or block behavior.</li><li>It does not delete or despawn a hidden entity. The server still treats it normally.</li><li>It does not protect exposed builds from normal sight.</li><li>It does not hide roads, tunnels, travel trails, maps or coordinates shared by players.</li><li>It does not make a surface base invisible to somebody flying or walking past it.</li><li>It does not prevent ordinary exploration from finding a base.</li></ul>
<h2>Examples</h2>
<h3>Underground villager hall</h3><p>A villager trading hall 30–40 blocks away and several solid blocks inside a hill can have its villagers hidden from managed client information until the player gets a legitimate view or moves close enough.</p>
<h3>Shulker storage</h3><p>Shulker boxes are protected, including all colors. Storage placed behind enough terrain benefits from PieCloak. Ordinary chests and barrels are not currently on the PieCloak allowlist, so a chest room should not be assumed to receive the same protection.</p>
<h3>Decorated entrance</h3><p>Signs, banners, beds, heads, paintings and item frames can all be revealing parts of a hidden build. PieCloak protects those listed types when they are sufficiently occluded, but the ordinary blocks forming the entrance are still visible normally.</p>
<h3>Surface base</h3><p>PieCloak offers limited help to a base that is plainly visible on the surface. It reduces selected client-side information leaks; it does not replace normal concealment.</p>
<h2>Frequently asked questions</h2>
<h3>Does PieCloak make my base invisible?</h3><p>No. It hides selected entity and block-entity information when the player should not legitimately be able to see it. The actual build still exists and can be found normally.</p>
<h3>Will PieCloak break villagers, pets or farms?</h3><p>No. Hidden entities continue existing and functioning on the server. Villagers still trade and breed, mobs still run their AI, and farms continue working normally.</p>
<h3>Can PieCloak hide me from another player?</h3><p>No. Player entities are specifically excluded.</p>
<h3>What happens when somebody gets close?</h3><p>Within about 24 blocks, protected entities and block entities are shown normally. PieCloak is not intended to hide nearby activity.</p>
<h3>Does it hide ores or work like anti-xray?</h3><p>No. PieCloak is focused on selected entities and block entities used in base finding. Ordinary blocks and ores are not hidden.</p>
<h3>Do I need to do anything to enable it?</h3><p>No. PieCloak works automatically for the server. The part players control is how they design and conceal their base.</p>
`};
for(const page of Object.values(P)){
  if(!page||typeof page.body!=='string')continue;
  page.body=page.body.replaceAll('data-page="base-privacy"','data-page="piecloak"').replaceAll('>Base Privacy<','>PieCloak<');
}
if(P.mechanics&&typeof P.mechanics.body==='string'){
  P.mechanics.body=P.mechanics.body.replace(/<a data-page="piecloak"><b>[^<]+<\/b><span>[^<]*<\/span><\/a>/, '<a data-page="piecloak"><b>PieCloak</b><span>base privacy, protected entities and block entities</span></a>');
}
delete P['base-privacy'];
})();
