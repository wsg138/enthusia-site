import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SOURCE = process.env.WIKI_DEMO_SOURCE || 'public/wiki-demo';
const RENDERED = process.env.WIKI_RENDER_OUT || 'wiki-worker-output/rendered';
const loadOrder = ['v2-core.js','v2-support.js','v2-commands.js','v2-detail.js','v2-final.js','v2-polish.js','v2-reputation.js'];

globalThis.window = {};
for (const name of loadOrder) {
  const file = path.join(SOURCE, name);
  if (!fs.existsSync(file)) throw new Error(`Missing wiki source file: ${file}`);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
const sourcePages = window.WIKI_V2?.pages;
if (!sourcePages) throw new Error('WIKI_V2 pages did not load');

const manifestPath = path.join(RENDERED, 'manifest.json');
if (!fs.existsSync(manifestPath)) throw new Error('Rendered manifest is missing');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const byId = new Map(manifest.pages.map(item => [item.id, item]));
const cssPath = path.join(RENDERED, 'EnthusiaWiki.styles.css');
const css = fs.readFileSync(cssPath, 'utf8');

const failures = [];
const stats = { pages: 0, topicCards: 0, factGrids: 0, dropdowns: 0, tables: 0 };
const requiredCss = [
  '.enthusia-wiki .topic-card',
  '.enthusia-wiki .topic-card span',
  '.enthusia-wiki .fact-grid span',
  '.enthusia-drop summary',
  '.enthusia-drop>div',
  '.enthusia-wiki .enthusia-table td',
];
for (const selector of requiredCss) {
  if (!css.includes(selector)) failures.push(`TemplateStyles is missing required selector: ${selector}`);
}

for (const [id, page] of Object.entries(sourcePages)) {
  if (!page?.title || typeof page.body !== 'string') continue;
  const item = byId.get(id);
  if (!item) {
    failures.push(`${id}: rendered manifest entry is missing`);
    continue;
  }
  const file = path.join(RENDERED, item.filename);
  if (!fs.existsSync(file)) {
    failures.push(`${id}: rendered page file is missing`);
    continue;
  }
  const rendered = fs.readFileSync(file, 'utf8');
  stats.pages += 1;

  if (/\sdata-(?:page|special|community)=/i.test(rendered)) failures.push(`${id}: unresolved data-link attribute remains`);
  if (/<a\b[^>]*class="[^"]*\btopic-card\b/i.test(rendered)) failures.push(`${id}: preview topic-card anchor survived conversion`);

  const expectedTopicCards = (page.body.match(/<a\b[^>]*class="[^"]*\btopic-card\b[^>]*>/gi) || []).length;
  const actualTopicCards = (rendered.match(/<div class="topic-card">/g) || []).length;
  stats.topicCards += actualTopicCards;
  if (actualTopicCards !== expectedTopicCards) failures.push(`${id}: topic-card count ${actualTopicCards} != source ${expectedTopicCards}`);
  if (actualTopicCards) {
    const cards = rendered.match(/<div class="topic-card">[\s\S]*?<\/div>/g) || [];
    for (const card of cards) {
      if (!/<b>\[\[[^\]]+\]\]<\/b>/.test(card)) failures.push(`${id}: topic-card title is not a separate internal link`);
      if (!/<span>[^<]+<\/span>/.test(card)) failures.push(`${id}: topic-card description is missing or collapsed into its link`);
    }
  }

  const expectedFacts = (page.body.match(/class="fact-grid"/g) || []).length;
  const actualFacts = (rendered.match(/class="fact-grid"/g) || []).length;
  stats.factGrids += actualFacts;
  if (actualFacts !== expectedFacts) failures.push(`${id}: fact-grid count ${actualFacts} != source ${expectedFacts}`);

  const expectedDrops = (page.body.match(/<details\b[^>]*class="[^"]*\bdrop\b/gi) || []).length;
  const actualDrops = (rendered.match(/<details\b[^>]*class="enthusia-drop [^"]*\bdrop\b/gi) || []).length;
  stats.dropdowns += actualDrops;
  if (actualDrops !== expectedDrops) failures.push(`${id}: dropdown count ${actualDrops} != source ${expectedDrops}`);

  const expectedTables = (page.body.match(/<table\b/gi) || []).length;
  const actualTables = (rendered.match(/<table\b[^>]*class="[^"]*\benthusia-table\b/gi) || []).length;
  stats.tables += actualTables;
  if (actualTables !== expectedTables) failures.push(`${id}: responsive table count ${actualTables} != source ${expectedTables}`);
}

const mechanics = fs.readFileSync(path.join(RENDERED, byId.get('mechanics').filename), 'utf8');
if (mechanics.includes('Server Informationpermanent world')) failures.push('mechanics: title and description were concatenated');
const historyItem = byId.get('history-lore');
if (historyItem) {
  const history = fs.readFileSync(path.join(RENDERED, historyItem.filename), 'utf8');
  if (history.includes('Player Pagesplayers')) failures.push('history-lore: title and description were concatenated');
}

const report = { ok: failures.length === 0, stats, failures };
const reportPath = path.join(path.dirname(RENDERED), 'structure-validation.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
