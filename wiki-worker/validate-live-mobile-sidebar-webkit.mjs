import fs from 'node:fs';
import path from 'node:path';
import { webkit } from 'playwright';

const outDir = process.env.WIKI_SAFARI_OUT || 'wiki-safari-output';
fs.mkdirSync(outDir, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

await page.goto(`https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&native_perf=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
for (const selector of ['#main-menu-input', '#mw-mf-page-left', '.main-menu-mask', 'label.enthusia-native-sidebar-close[for="main-menu-input"]', '.enthusia-mobile-quickbar']) {
  await page.waitForSelector(selector, { state: 'attached', timeout: 30000 });
}
await page.waitForTimeout(700);

const initial = await page.evaluate(() => {
  const input = document.querySelector('#main-menu-input');
  const sidebar = document.querySelector('#mw-mf-page-left');
  const mask = document.querySelector('.main-menu-mask');
  const close = document.querySelector('.enthusia-native-sidebar-close');
  const quickbar = document.querySelector('.enthusia-mobile-quickbar');
  const r = input.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { checked: input.checked, hitId: hit ? hit.id || null : null, sidebarTransitionDuration: getComputedStyle(sidebar).transitionDuration, maskTransitionDuration: getComputedStyle(mask).transitionDuration, quickbarBackdropFilter: getComputedStyle(quickbar).backdropFilter || getComputedStyle(quickbar).webkitBackdropFilter || 'none', quickbarZIndex: getComputedStyle(quickbar).zIndex, closeTag: close.tagName, closeFor: close.htmlFor || close.getAttribute('for'), maskTag: mask.tagName, maskFor: mask.htmlFor || mask.getAttribute('for'), maskMode: mask.dataset.enthusiaCloseMode || null, mirroredMenuClass: document.documentElement.classList.contains('enthusia-minerva-menu-open'), legacyDrawerCount: document.querySelectorAll('.enthusia-mobile-drawer, .enthusia-mobile-shade').length };
});
if (initial.hitId !== 'main-menu-input') throw new Error(`Native checkbox is not the physical hamburger hit target: ${JSON.stringify(initial)}`);
if (initial.sidebarTransitionDuration !== '0s' || initial.maskTransitionDuration !== '0s') throw new Error(`Live no-transition CSS is not active: ${JSON.stringify(initial)}`);
if (initial.quickbarBackdropFilter !== 'none') throw new Error(`Minerva quickbar still uses backdrop blur: ${JSON.stringify(initial)}`);
if (initial.closeTag !== 'LABEL' || initial.closeFor !== 'main-menu-input') throw new Error(`Close X is not a native checkbox label: ${JSON.stringify(initial)}`);
if (initial.mirroredMenuClass) throw new Error(`Enthusia menu-state class is still active: ${JSON.stringify(initial)}`);
if (initial.legacyDrawerCount !== 0) throw new Error(`Legacy custom drawer remains in active mobile DOM: ${JSON.stringify(initial)}`);

await page.evaluate(() => {
  window.__enthRootClassMutations = [];
  const root = document.documentElement;
  new MutationObserver(() => window.__enthRootClassMutations.push({ at: performance.now(), className: root.className })).observe(root, { attributes: true, attributeFilter: ['class'] });
});

async function centerOf(selector) {
  return page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) throw new Error(`Missing element ${sel}`); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
}
async function waitChecked(expected, timeout = 1800) { await page.waitForFunction((value) => { const input = document.querySelector('#main-menu-input'); return Boolean(input) && Boolean(input.checked) === value; }, expected, { timeout }); }
async function waitOpen(timeout = 1800) { await page.waitForFunction(() => { const input = document.querySelector('#main-menu-input'); const sidebar = document.querySelector('#mw-mf-page-left'); if (!input || !sidebar || !input.checked) return false; const r = sidebar.getBoundingClientRect(); return getComputedStyle(sidebar).visibility !== 'hidden' && r.left > -8; }, null, { timeout }); }
async function waitClosed(timeout = 1800) { await page.waitForFunction(() => { const input = document.querySelector('#main-menu-input'); const sidebar = document.querySelector('#mw-mf-page-left'); if (!input || !sidebar || input.checked) return false; const r = sidebar.getBoundingClientRect(); return getComputedStyle(sidebar).visibility === 'hidden' || r.right < 8; }, null, { timeout }); }
async function tapToState(selector, expectedOpen) { const p = await centerOf(selector); const start = Date.now(); await page.touchscreen.tap(p.x, p.y); const tapReturnedMs = Date.now() - start; await waitChecked(expectedOpen); const stateMs = Date.now() - start; if (expectedOpen) await waitOpen(); else await waitClosed(); return { tapReturnedMs, stateMs, renderedMs: Date.now() - start }; }
async function tapBackdrop() { const point = await page.evaluate(() => { const r = document.querySelector('#mw-mf-page-left').getBoundingClientRect(); return { x: Math.min(380, Math.max(r.right + 24, 360)), y: 400 }; }); const start = Date.now(); await page.touchscreen.tap(point.x, point.y); const tapReturnedMs = Date.now() - start; await waitChecked(false); const stateMs = Date.now() - start; await waitClosed(); return { tapReturnedMs, stateMs, renderedMs: Date.now() - start }; }
async function bottomMenuSelector() { return page.evaluate(() => { const buttons = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')); const target = buttons.find((button) => Array.from(button.querySelectorAll('span')).some((span) => /^menu$/i.test((span.textContent || '').trim()))); if (!target) return null; if (!target.id) target.id = 'enthusia-webkit-bottom-menu'; return '#enthusia-webkit-bottom-menu'; }); }

const timings = [];
for (let cycle = 1; cycle <= 6; cycle += 1) {
  timings.push({ cycle, action: 'hamburger-open', ...(await tapToState('#main-menu-input', true)) });
  const overlayCheck = await page.evaluate(() => { const bar = document.querySelector('.enthusia-mobile-quickbar'); const r = bar.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hitClass: hit ? String(hit.className || '') : null, quickbarOnTop: Boolean(hit && hit.closest('.enthusia-mobile-quickbar')) }; });
  if (overlayCheck.quickbarOnTop) throw new Error(`Quickbar remains above the open native menu: ${JSON.stringify(overlayCheck)}`);
  timings.push({ cycle, action: 'x-close', ...(await tapToState('label.enthusia-native-sidebar-close[for="main-menu-input"]', false)) });
  timings.push({ cycle, action: 'hamburger-reopen', ...(await tapToState('#main-menu-input', true)) });
  timings.push({ cycle, action: 'backdrop-close', ...(await tapBackdrop()) });
}
const bottomSelector = await bottomMenuSelector();
if (!bottomSelector) throw new Error('Bottom Menu button was not available');
timings.push({ cycle: 'bottom', action: 'bottom-menu-open', ...(await tapToState(bottomSelector, true)) });
timings.push({ cycle: 'bottom', action: 'x-close', ...(await tapToState('label.enthusia-native-sidebar-close[for="main-menu-input"]', false)) });
const finalState = await page.evaluate(() => ({ checked: document.querySelector('#main-menu-input').checked, mirroredMenuClass: document.documentElement.classList.contains('enthusia-minerva-menu-open'), rootClassMutations: window.__enthRootClassMutations || [], legacyDrawerCount: document.querySelectorAll('.enthusia-mobile-drawer, .enthusia-mobile-shade').length, pageClass: document.documentElement.className }));
const slow = timings.filter((entry) => entry.renderedMs > 500);
const mirroredMutation = finalState.rootClassMutations.find((entry) => /(?:^|\s)enthusia-minerva-menu-open(?:\s|$)/.test(entry.className));
if (slow.length) throw new Error(`WebKit mobile menu exceeded 500ms: ${JSON.stringify(slow)}`);
if (finalState.mirroredMenuClass || mirroredMutation) throw new Error(`Menu open/close still mutates an Enthusia root state class: ${JSON.stringify(finalState)}`);
if (finalState.legacyDrawerCount !== 0) throw new Error(`Legacy drawer reappeared during interactions: ${JSON.stringify(finalState)}`);
if (pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify(pageErrors)}`);
await tapToState('#main-menu-input', true);
await page.screenshot({ path: path.join(outDir, 'webkit-native-menu-open.png'), fullPage: false });
await tapToState('label.enthusia-native-sidebar-close[for="main-menu-input"]', false);
const result = { initial, timings, finalState, pageErrors };
fs.writeFileSync(path.join(outDir, 'webkit-native-menu-performance.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
await browser.close();
