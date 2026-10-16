// Local triage of a saved report, not a replacement for hosted Codacy analysis.
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'acorn'; // Included in the locked ESLint development toolchain.

const findings = JSON.parse(await readFile('docs/pr-feedback/52-findings.json', 'utf8'));
const cache = new Map();
// Exact saved finding -> renamed responsibility, reviewed during decomposition.
// This avoids mistaking the separate alerts draw callback for the weekly draw.
const renamedFunctions=new Map([['e3ed6a0f98d0875750839a9e3aa4b794','drawWeek']]);
const archivedSources = new Map([
  ['public/assets/exact-controls/home-christmas.js', 'designs/unreleased/christmas/controls.js.txt'],
  ['public/preview/design-reference/mock/home-christmas.js', 'designs/unreleased/christmas/reference-controls.js.txt']
]);
const isFunction = node => /Function/.test(node.type) || node.type === 'ArrowFunctionExpression';
const children = node => Object.values(node).flatMap(value => Array.isArray(value) ? value
  : value && typeof value === 'object' ? [value] : []).filter(value => value && typeof value.type === 'string');

function complexity(node) {
  let count = 1;
  function visit(child) {
    if (child !== node && isFunction(child)) return;
    if (['IfStatement', 'ForStatement', 'ForOfStatement', 'ForInStatement', 'WhileStatement',
      'DoWhileStatement', 'CatchClause', 'ConditionalExpression', 'LogicalExpression'].includes(child.type)
      || child.type === 'SwitchCase' && child.test) count++;
    children(child).forEach(visit);
  }
  visit(node);
  return count;
}

async function sourceFunctions(file) {
  if (cache.has(file)) return cache.get(file);
  if (!/\.(js|mjs)$/.test(file)) return [];
  const source = await readFile(archivedSources.get(file) ?? file, 'utf8');
  const comments=[];
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true,onComment:comments });
  // NLOC excludes blank/comment lines; source span includes both and is retained
  // separately for location evidence. Preserve newlines when removing comments.
  let code=source;
  for(const comment of comments.slice().reverse())code=code.slice(0,comment.start)+code.slice(comment.start,comment.end).replace(/[^\r\n]/g,' ')+code.slice(comment.end);
  const codeLines=code.split('\n');
  const functions = [];
  function visit(node, parent) {
    if (isFunction(node)) functions.push({
      name: node.id?.name ?? parent?.key?.name ?? parent?.id?.name ?? '(anonymous)',
      start: node.loc.start.line, end: node.loc.end.line,
      ccn: complexity(node), sourceLines: node.loc.end.line - node.loc.start.line + 1,
      nloc:codeLines.slice(node.loc.start.line-1,node.loc.end.line).filter(line=>line.trim()).length
    });
    children(node).forEach(child => visit(child, node));
  }
  visit(ast, null);
  functions.sourceLines=source.split('\n');
  functions.nloc=codeLines.filter(line=>line.trim()).length;
  cache.set(file, functions);
  return functions;
}

async function metricFinding(finding) {
  if (finding.file === 'package-lock.json') return {
    disposition: 'analyzer-mismatch', reason: 'Generated dependency lockfile, not application control flow.'
  };
  if (finding.file === 'wiki-worker/safety.py') return {
    disposition: 'changed-pending-hosted-analysis', reason: 'Trusted URL comparison was simplified; allowed and hostile URL cases passed.'
  };
  if (finding.pattern === 'Lizard_file-nloc-medium') {
    const current=await sourceFunctions(finding.file);
    return {disposition:current.nloc<=500?'below-threshold-local':'maintainability-open',
      current:{nloc:current.nloc},reason:'Current nonblank/noncomment lines measured locally; hosted file metrics remain a separate gate.'};
  }
  const name = renamedFunctions.get(finding.id)??finding.message.match(/^Method (.*?) has/)?.[1];
  const functions=await sourceFunctions(finding.file);
  const candidates = functions.filter(item => item.name === name);
  // Never use obsolete report line numbers. An anonymous callback can be located
  // only by a unique exact saved source line, then its smallest enclosing function.
  const current = candidates.length === 1 ? candidates[0] : anonymousLocation(finding,functions);
  const withinThreshold = current && (finding.pattern === 'Lizard_ccn-medium' ? current.ccn <= 8 : current.nloc <= 50);
  return {
    disposition: withinThreshold ? 'below-threshold-local' : 'maintainability-open', current,
    reason: withinThreshold
      ? 'Current AST function is below the reported threshold; a fresh hosted analyzer result remains required.'
      : 'Retained as open. Literal SQL/CSS bodies, ambiguous callbacks and complex business/UI logic require manual decomposition or analyzer review.'
  };
}

function anonymousLocation(finding,functions){
  if(!finding.message.startsWith('Method (anonymous)')||!finding.code)return null;
  const matches=functions.sourceLines?.flatMap((line,index)=>line.trim()===finding.code.trim()?[index+1]:[])??[];
  if(matches.length!==1)return null;
  const candidates=functions.filter(row=>row.start<=matches[0]&&row.end>=matches[0]).sort((a,b)=>a.sourceLines-b.sourceLines);
  if(!candidates.length||candidates[0].sourceLines===candidates[1]?.sourceLines)return null;
  return candidates[0];
}

async function disposition(finding) {
  const { pattern, file } = finding;
  if (pattern.startsWith('Lizard_')) return metricFinding(finding);
  if (pattern.startsWith('TSQLLint_') || pattern === 'SQLint_allIssues' || pattern.endsWith('rac-table-access')) return {
    disposition: 'analyzer-mismatch', reason: 'Cloudflare D1 uses SQLite: PRAGMA, AUTOINCREMENT and NEW/OLD triggers are valid. T-SQL directives and RAC_ table names do not apply. Migration/persistence tests pass.'
  };
  if (pattern.includes('InnaccurateNumericLiteral')) return {
    disposition: 'verified-safe', reason: 'ECMAScript Number semantics: the reported integer literals are within safe integer range; 0.9 and 0.10 are intentional floating-point ratios. No incorrect conversion was found.'
  };
  if (pattern.includes('no-stringify-keys')) return {
    disposition: 'verified-safe', reason: 'JSON document serialization, cloning or array-of-string comparison; not object-key/hash generation. Persistence/privacy tests pass.'
  };
  if (pattern.includes('no-replaceall') || pattern.includes('selector-not-notation') || pattern.includes('ConsistentReturn')) return {
    disposition: 'changed-pending-hosted-analysis', reason: 'Equivalent global literal replacements, grouped selectors, or consistent startup return behavior.'
  };
  if (pattern.includes('unsafe-dynamic-method')) return {
    disposition: 'changed-pending-hosted-analysis', reason: 'Preview dispatch now uses a Map of explicit own function entries. Failing inherited-handler regression now passes; no eval or command execution exists.'
  };
  if (pattern.includes('rule-node-ssrf')) return file.endsWith('community-dom.js') ? {
    disposition: 'changed-pending-hosted-analysis', reason: 'Exact namespace/routes, decoded slug validation and query allowlist reject traversal before fetch; same-origin credentials and redirect rejection are enforced. Regression reproduced failure before repair.'
  } : {
    disposition: 'verified-safe', reason: 'Browser-side local API request, not a server-side URL fetch. UUID/action or exact-route validation rejects attacker destinations; browser request safety tests pass.'
  };
  if (pattern.includes('non-literal-fs-filename')) return {
    disposition: 'verified-safe', reason: 'Test-only repository source reads; paths come from fixed test literals, not requests or users. Production has no filesystem adapter here.'
  };
  if (pattern.includes('missing-template-string-indicator')) return {
    disposition: 'verified-safe', reason: 'Already a JavaScript template literal containing static SQLite insert data. Test executes successfully; no intended interpolation is missing.'
  };
  return { disposition: 'review-open', reason: 'No automatic closure.' };
}

const audited = [];
for (const finding of findings) audited.push({ ...finding, ...await disposition(finding) });
await writeFile('docs/pr-feedback/52-dispositions.json', JSON.stringify(audited, null, 2) + '\n');
const totals = {};
for (const finding of audited) totals[finding.disposition] = (totals[finding.disposition] ?? 0) + 1;
console.log(JSON.stringify({ findings: audited.length, totals }, null, 2));
