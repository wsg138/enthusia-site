import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SOURCE = process.env.WIKI_DEMO_SOURCE || 'public/wiki-demo';
const OUT = process.env.WIKI_RENDER_OUT || 'wiki-worker-output/rendered';
const loadOrder = ['v2-core.js','v2-support.js','v2-commands.js','v2-detail.js','v2-final.js','v2-polish.js','v2-reputation.js'];
const STYLE_TITLE = 'Template:EnthusiaWiki/styles.css';
const STYLE_TAG = `<templatestyles src="${STYLE_TITLE}" />`;

globalThis.window = {};
for (const name of loadOrder) {
  const file = path.join(SOURCE, name);
  if (!fs.existsSync(file)) throw new Error(`Missing wiki source file: ${file}`);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
const pages = window.WIKI_V2?.pages;
if (!pages) throw new Error('WIKI_V2 pages did not load');

const specials = { players: 'Noteable Players', guilds: 'Noteable Guilds', staff: 'Staff', maparts: 'Maparts' };
const pageTitle = id => pages[id]?.title || id.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
function replaceDataLink(html, attr, resolve) {
  const re = new RegExp(`<a\\b[^>]*\\b${attr}="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>`, 'g');
  return html.replace(re, (_, value, label) => `[[${resolve(value)}|${stripTags(label)}]]`);
}
function internalLinks(html) {
  let out = replaceDataLink(html, 'data-page', pageTitle);
  out = replaceDataLink(out, 'data-special', id => specials[id] || id);
  out = replaceDataLink(out, 'data-community', title => title);
  return out;
}
function sanitize(html) {
  let out = internalLinks(html);
  out = out.replace(/\sdata-(?:page|special|community)="[^"]*"/g, '');
  out = out.replace(/<button[^>]*>([\s\S]*?)<\/button>/g, '$1');
  out = out.replace(/<details([^>]*)class="([^"]*)"([^>]*)>/g, '<details$1class="enthusia-drop $2"$3>');
  out = out.replace(/<table>/g, '<table class="wikitable enthusia-table">');
  return `${STYLE_TAG}\n<div class="enthusia-wiki">\n${out.trim()}\n</div>\n`;
}
function mainPage() {
  const cards = [
    ['Staff.png','Staff','Staff'], ['Guilds.png','Guilds','Noteable Guilds'], ['Players.png','Players','Noteable Players'],
    ['Betas.png','Betas','Betas'], ['Builds.png','Builds','Builds'], ['Mapart.png','Mapart','Maparts'],
    ['Events.png','Events','Events'], ['Mechanics2.png','Mechanics','Mechanics'],
  ];
  const cardHtml = cards.map(([img,label,target]) => `<div class="enthusia-home-card">[[File:${img}|220px|link=${target}]]<div>'''[[${target}|${label}]]'''</div></div>`).join('\n');
  return `${STYLE_TAG}\n<div class="enthusia-wiki enthusia-home">
<div class="enthusia-hero">
<div class="enthusia-eyebrow">Enthusia SMP</div>
<h1>Welcome to the Enthusia Wiki</h1>
<p>Guides for Enthusia's permanent semi-anarchy world, Raw Gold economy, guilds, PvP, progression, base privacy and community history.</p>
<div class="enthusia-quick">[[Server Information|Start here]] · [[Mechanics|Browse mechanics]] · [[Commands|Commands]] · [[History & Lore|History & Lore]]</div>
</div>
<div class="enthusia-cross"><strong>Cross-platform</strong><br>Java and Bedrock players can both join and play together on the same SMP.<br><code>enthusia.net</code> · Bedrock port <code>19132</code></div>
<h2>Explore Enthusia</h2>
<div class="enthusia-home-grid">${cardHtml}</div>
<div class="enthusia-home-columns">
<div><h2>Community</h2><p>[[Noteable Players|Player pages]], [[Noteable Guilds|guild pages]], [[History & Lore|server history]], [[Builds|builds]] and [[Maparts|mapart]].</p></div>
<div><h2>Gameplay</h2><p>[[PieCloak]], [[Raw Gold]], [[Market]], [[Guilds]], [[Homes & Teleportation]], [[Combat & PvP]], [[Warzone]], [[Playtime]], [[Reputation]] and more.</p></div>
</div>
</div>`;
}

const css = `.enthusia-wiki{max-width:1120px;margin:0 auto;line-height:1.65}.enthusia-wiki h1,.enthusia-wiki h2,.enthusia-wiki h3{line-height:1.2}.enthusia-hero,.enthusia-cross,.enthusia-wiki .status,.enthusia-wiki .callout{border:1px solid #3c4652;border-radius:14px;padding:18px 20px;margin:16px 0;background:rgba(24,29,35,.65)}.enthusia-eyebrow{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;opacity:.72}.enthusia-quick{margin-top:14px;font-weight:600}.enthusia-home-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:18px 0}.enthusia-home-card{border:1px solid #3c4652;border-radius:14px;padding:12px;text-align:center;background:rgba(24,29,35,.45)}.enthusia-home-card img{border-radius:9px;max-width:100%;height:auto}.enthusia-home-columns,.enthusia-wiki .fact-grid,.enthusia-wiki .topic-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.enthusia-home-columns>div,.enthusia-wiki .fact-grid>div,.enthusia-wiki .topic-card{border:1px solid #3c4652;border-radius:12px;padding:14px;background:rgba(24,29,35,.35)}.enthusia-drop{border:1px solid #3c4652;border-radius:10px;padding:10px 14px;margin:10px 0}.enthusia-drop summary{cursor:pointer}.enthusia-table{width:100%;margin:12px 0}.enthusia-wiki code{white-space:nowrap}.enthusia-cross{font-size:1rem}@media(max-width:650px){.enthusia-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.enthusia-home-columns,.enthusia-wiki .fact-grid,.enthusia-wiki .topic-grid{grid-template-columns:1fr}}`;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const [id, page] of Object.entries(pages)) {
  if (!page?.title || typeof page.body !== 'string') continue;
  const filename = `${id}.wiki`;
  fs.writeFileSync(path.join(OUT, filename), sanitize(page.body));
  manifest.push({ id, title: page.title, filename, summary: page.summary || '', section: page.section || '' });
}
fs.writeFileSync(path.join(OUT, 'Main_Page.wiki'), mainPage());
manifest.unshift({ id: 'main-page', title: 'Main Page', filename: 'Main_Page.wiki', summary: 'Enthusia wiki home page', section: 'Home' });
fs.writeFileSync(path.join(OUT, 'EnthusiaWiki.styles.css'), css + '\n');
manifest.unshift({ id: 'template-styles', title: STYLE_TITLE, filename: 'EnthusiaWiki.styles.css', contentModel: 'sanitized-css' });
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pages: manifest }, null, 2) + '\n');
console.log(`Rendered ${manifest.length} wiki targets.`);
