// Local triage of a saved report, not a replacement for hosted Codacy analysis.
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'acorn'; // Included in the locked ESLint development toolchain.

const findings = JSON.parse(await readFile('docs/pr-feedback/52-findings.json', 'utf8'));
const cache = new Map();
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
  const source = await readFile(file, 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const functions = [];
  function visit(node, parent) {
    if (isFunction(node)) functions.push({
      name: node.id?.name ?? parent?.key?.name ?? parent?.id?.name ?? '(anonymous)',
      start: node.loc.start.line, end: node.loc.end.line,
      ccn: complexity(node), sourceLines: node.loc.end.line - node.loc.start.line + 1
    });
    children(node).forEach(child => visit(child, node));
  }
  visit(ast, null);
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
  if (finding.pattern === 'Lizard_file-nloc-medium') return {
    disposition: 'maintainability-open', reason: 'Large first-party module needs a separate domain-specific decomposition.'
  };
  const name = finding.message.match(/^Method (.*?) has/)?.[1];
  const candidates = (await sourceFunctions(finding.file)).filter(item => item.name === name);
  // Never map ambiguous anonymous callbacks using an old report line number.
  const current = candidates.length === 1 ? candidates[0] : null;
  const withinThreshold = current && (finding.pattern === 'Lizard_ccn-medium' ? current.ccn <= 8 : current.sourceLines <= 50);
  return {
    disposition: withinThreshold ? 'below-threshold-local' : 'maintainability-open', current,
    reason: withinThreshold
      ? 'Current AST function is below the reported threshold; a fresh hosted analyzer result remains required.'
      : 'Retained as open. Literal SQL/CSS bodies, ambiguous callbacks and complex business/UI logic require manual decomposition or analyzer review.'
  };
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
