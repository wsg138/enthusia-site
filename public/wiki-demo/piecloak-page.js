(()=>{
const P=window.WIKI_DEMO_DATA.pages;
const list=items=>`<ul class="dense-list">${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
const entities=['Villager','Copper Golem','Armadillo','Wolf','Cat','Ocelot','Allay','Bee','Iron Golem','Snow Golem','Item Frame','Glow Item Frame','Armor Stand','Painting'];
const blockEntities=['Campfire / Soul Campfire','Decorated Pot','Bell','Jukebox','Conduit','Beacon','Moving Piston','Shulker Boxes','Signs','Hanging Signs','Banners / Wall Banners','Beds','Heads and Skulls'];
P.piecloak={title:'PieCloak',group:'Gameplay',summary:'How Enthusia reduces ESP, pie-chart and block-entity base finding for hidden bases.',body:`
<p><strong>PieCloak</strong> is Enthusia's base-privacy system. It reduces information exposed to client-side ESP, pie-chart and block-entity base-finding tools when terrain or walls block legitimate visibility. The entities and block entities still exist and continue working normally on the server.</p>
<p>Because Enthusia has no land claims, location privacy matters. PieCloak makes several common base-finding methods less useful without making bases invisible or protected from normal exploration.</p>
<div class="callout"><b>PieCloak helps hide a base. It does not protect a base.</b> If somebody reaches the location normally, PieCloak does not stop them from seeing, entering, raiding or griefing it.</div>
<h2>How visibility works</h2>
<div class="fact-grid"><div><b>Within 24 blocks</b><span>Protected entities and block entities are always shown.</span></div><div><b>24–48 blocks</b><span>Terrain and walls are checked. Three blocking samples are enough to hide a protected entity or block entity.</span></div><div><b>Beyond 48 blocks</b><span>Protected entities and block entities stay outside the visibility radius until the player moves closer.</span></div><div><b>Players</b><span>Players are never hidden by PieCloak.</span></div></div>
<p>The 24–48 block range is where base construction matters most. A villager or shulker box several solid blocks inside a hill is much harder to detect than the same thing placed directly against a thin exterior wall.</p>
<h2>Building for better privacy</h2>
<ul><li>Keep protected entities and block entities <strong>several solid blocks inside terrain</strong> where possible.</li><li>Avoid placing things such as villagers, shulker boxes, signs, banners, beds or item frames directly against the outside wall of a hidden base.</li><li>Natural terrain, thicker walls and entrances with bends are better than a thin shell around a large hollow room.</li><li>Remember the 24-block always-visible range. PieCloak is designed to reduce long-range information leaks, not hide activity from somebody already beside the base.</li><li>Use normal secrecy too: avoid obvious surface entrances, repeated travel trails, exposed portals, shared coordinates, public maps and visible builds.</li></ul>
<h2>Protected entities</h2>
<p>Only selected entity types are managed by PieCloak.</p>
<details class="info-drop"><summary><b>Protected entities</b><span>${entities.length} entity types</span></summary><div>${list(entities)}</div></details>
<h2>Protected block entities</h2>
<p>Color, wood and wall variants are grouped together below because they receive the same protection.</p>
<details class="info-drop"><summary><b>Protected block entities</b><span>${blockEntities.length} groups</span></summary><div>${list(blockEntities)}</div></details>
<h2>What PieCloak does not cover</h2>
<ul><li><strong>Players are not hidden.</strong></li><li><strong>Particles are not hidden by PieCloak.</strong> Particle-producing blocks or activity can still provide information to somebody deliberately searching for them. Crying Obsidian is one example.</li><li>PieCloak does not hide an exposed build from normal sight.</li><li>It does not hide travel trails, tunnels, maps or coordinates shared by players.</li><li>It does not prevent ordinary exploration from finding a base.</li></ul>
<h2>What happens to hidden entities?</h2>
<p>Nothing changes on the server itself. Villagers still trade and breed, pets and mobs still run their normal AI, farms continue working, and block entities continue functioning. PieCloak changes what information is sent to a distant player's client when the protected object should be hidden behind terrain.</p>
<h2>Examples</h2>
<h3>Underground villager hall</h3><p>A villager trading hall 30–40 blocks away and several solid blocks inside a hill can have its villagers hidden until the searching player gets a legitimate view or moves close enough.</p>
<h3>Shulker storage</h3><p>Shulker Boxes are protected as one group regardless of color. Storage placed behind enough terrain benefits from the same visibility rules.</p>
<h3>Decorated entrance</h3><p>Signs, banners, beds, heads, paintings and item frames can reveal that a hidden build exists. PieCloak protects those listed types when they are sufficiently blocked by terrain, but the build itself can still be found normally.</p>
<h3>Surface base</h3><p>PieCloak offers limited help to a base that is plainly visible on the surface. It reduces selected client-side information leaks; it does not replace normal concealment.</p>
<h2>Frequently asked questions</h2>
<h3>Does PieCloak make my base invisible?</h3><p>No. It hides selected entity and block-entity information when a player should not legitimately be able to see it. The actual build still exists and can be found normally.</p>
<h3>Will PieCloak break villagers, pets or farms?</h3><p>No. Hidden entities continue existing and functioning normally on the server.</p>
<h3>Can PieCloak hide me from another player?</h3><p>No. Player entities are specifically excluded.</p>
<h3>What happens when somebody gets close?</h3><p>Within about 24 blocks, protected entities and block entities are shown normally.</p>
<h3>Do I need to enable anything?</h3><p>No. PieCloak works automatically. The part players control is how they design and conceal their base.</p>
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
