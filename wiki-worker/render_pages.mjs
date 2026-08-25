import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SOURCE = process.env.WIKI_DEMO_SOURCE || 'public/wiki-demo';
const OUT = process.env.WIKI_RENDER_OUT || 'wiki-worker-output/rendered';
const STYLE_SOURCE = process.env.WIKI_STYLE_SOURCE || 'wiki-worker/wiki-template.css';
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
if (!fs.existsSync(STYLE_SOURCE)) throw new Error(`Missing wiki TemplateStyles source: ${STYLE_SOURCE}`);

const specials = { players: 'Noteable Players', guilds: 'Noteable Guilds', staff: 'Staff', maparts: 'Maparts' };
const pageTitle = id => pages[id]?.title || id.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());

function stripTags(s) {
  return String(s)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function attrValue(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(attrs).match(new RegExp(`\\b${escaped}\\s*=\\s*"([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

function linkTarget(attrs) {
  const page = attrValue(attrs, 'data-page');
  if (page) return pageTitle(page);
  const special = attrValue(attrs, 'data-special');
  if (special) return specials[special] || special;
  const community = attrValue(attrs, 'data-community');
  if (community) return community;
  return '';
}

function topicCard(target, label) {
  const titleMatch = String(label).match(/<b\b[^>]*>([\s\S]*?)<\/b>/i);
  const descMatch = String(label).match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
  if (!titleMatch) return null;
  const title = stripTags(titleMatch[1]);
  const desc = descMatch ? stripTags(descMatch[1]) : '';
  if (!title) return null;
  return `<div class="topic-card"><b>[[${target}|${title}]]</b>${desc ? `<span>${desc}</span>` : ''}</div>`;
}

function internalLinks(html) {
  return String(html).replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, label) => {
    const target = linkTarget(attrs);
    if (!target) return whole;
    const classes = attrValue(attrs, 'class').split(/\s+/).filter(Boolean);
    if (classes.includes('topic-card')) {
      const converted = topicCard(target, label);
      if (converted) return converted;
    }
    return `[[${target}|${stripTags(label)}]]`;
  });
}

function addTableClass(attrs) {
  const value = String(attrs || '');
  const classMatch = value.match(/\bclass\s*=\s*"([^"]*)"/i);
  if (!classMatch) return `<table class="wikitable enthusia-table"${value}>`;
  const classes = classMatch[1].split(/\s+/).filter(Boolean);
  if (!classes.includes('wikitable')) classes.push('wikitable');
  if (!classes.includes('enthusia-table')) classes.push('enthusia-table');
  const replaced = value.replace(classMatch[0], `class="${classes.join(' ')}"`);
  return `<table${replaced}>`;
}

function translateDetails(html) {
  return String(html).replace(
    /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>\s*<div>([\s\S]*?)<\/div>\s*<\/details>/gi,
    (_, summary, body) => `<div class="enthusia-drop mw-collapsible mw-collapsed"><div class="enthusia-drop-summary">${summary}</div><div class="enthusia-drop-content mw-collapsible-content">${body}</div></div>`
  );
}

function sanitize(html) {
  let out = internalLinks(html);
  out = out.replace(/\sdata-(?:page|special|community)="[^"]*"/g, '');
  out = out.replace(/<button[^>]*>([\s\S]*?)<\/button>/g, '$1');
  out = translateDetails(out);
  out = out.replace(/<\/?(?:thead|tbody)\b[^>]*>/gi, '');
  out = out.replace(/<table([^>]*)>/g, (_, attrs) => addTableClass(attrs));
  return `${STYLE_TAG}\n<div class="enthusia-wiki">\n${out.trim()}\n</div>\n`;
}

function mainPage() {
  const cards = [
    ['Staff.png','Staff','Staff'], ['Guilds.png','Guilds','Noteable Guilds'], ['Players.png','Players','Noteable Players'],
    ['Betas.png','Betas','Betas'], ['Builds.png','Builds','Builds'], ['Mapart.png','Mapart','Maparts'],
    ['Events.png','Events','Events'], ['Mechanics2.png','Mechanics','Mechanics'],
    ['Templates.png','Commands','Commands'], ['Economy.png','Market','Market'], ['Mechanics.png','Warzone','Warzone'], ['Betas.png','History & Lore','History & Lore'],
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

const css = fs.readFileSync(STYLE_SOURCE, 'utf8').trim();
if (!css) throw new Error('Wiki TemplateStyles source is empty');

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