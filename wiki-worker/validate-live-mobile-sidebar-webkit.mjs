import fs from 'node:fs';
import path from 'node:path';
import { webkit } from 'playwright';

const outDir = process.env.WIKI_SAFARI_OUT || 'wiki-safari-output';
fs.mkdirSync(outDir, { recursive: true });

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

async function state() {
  return await page.evaluate(() => {
    const toggle = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const quickbar = document.querySelector('.enthusia-mobile-quickbar');
    const root = document.documentElement;
    if (!toggle || !sidebar || !mask) return null;
    const sideStyle = getComputedStyle(sidebar);
    const maskStyle = getComputedStyle(mask);
    const rect = sidebar.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    const quickStyle = quickbar ? getComputedStyle(quickbar) : null;
    const hit = document.elementFromPoint(
      toggleRect.left + toggleRect.width / 2,
      toggleRect.top + toggleRect.height / 2
    );
    return {
      checked: Boolean(toggle.checked),
      rootOpenClass: root.classList.contains('enthusia-minerva-menu-open'),
      sidebarVisibility: sideStyle.visibility,
      sidebarTransform: sideStyle.transform,
      sidebarTransitionProperty: sideStyle.transitionProperty,
      sidebarTransitionDuration: sideStyle.transitionDuration,
      sidebarLeft: rect.left,
      sidebarRight: rect.right,
      maskVisibility: maskStyle.visibility,
      maskOpacity: maskStyle.opacity,
      maskTransitionProperty: maskStyle.transitionProperty,
      maskTransitionDuration: maskStyle.transitionDuration,
      quickbarVisibility: quickStyle ? quickStyle.visibility : null,
      closeVisible: Boolean(document.querySelector('.enthusia-native-sidebar-close')),
      hamburgerRect: {
        left: toggleRect.left,
        top: toggleRect.top,
        width: toggleRect.width,
        height: toggleRect.height
      },
      hamburgerHitId: hit ? hit.id || null : null,
      hamburgerHitClass: hit ? String(hit.className || '') : null
    };
  });
}

async function centerOf(selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing element: ${sel}`);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
  }, selector);
}

async function waitChecked(expected, timeout = 1200) {
  await page.waitForFunction((value) => {
    const toggle = document.querySelector('#main-menu-input');
    return Boolean(toggle) && Boolean(toggle.checked) === value;
  }, expected, { timeout });
}

async function waitForOpen(timeout = 1200) {
  await page.waitForFunction(() => {
    const toggle = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    if (!toggle || !sidebar || !toggle.checked) return false;
    const rect = sidebar.getBoundingClientRect();
    return getComputedStyle(sidebar).visibility !== 'hidden' && rect.left > -8;
  }, null, { timeout });
}

async function waitForClosed(timeout = 1200) {
  await page.waitForFunction(() => {
    const toggle = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    if (!toggle || !sidebar || toggle.checked) return false;
    const style = getComputedStyle(sidebar);
    const rect = sidebar.getBoundingClientRect();
    return style.visibility === 'hidden' || rect.right < 8;
  }, null, { timeout });
}

async function tapHamburgerAndMeasure() {
  const point = await centerOf('#main-menu-input');
  const started = Date.now();
  await page.touchscreen.tap(point.x, point.y);
  await waitChecked(true);
  const checkedMs = Date.now() - started;
  await waitForOpen();
  const visibleMs = Date.now() - started;
  return { checkedMs, visibleMs, point };
}

async function tapCloseAndMeasure(selector) {
  const point = await centerOf(selector);
  const started = Date.now();
  await page.touchscreen.tap(point.x, point.y);
  await waitChecked(false);
  const uncheckedMs = Date.now() - started;
  await waitForClosed();
  const hiddenMs = Date.now() - started;
  return { uncheckedMs, hiddenMs, point };
}

async function tapBackdropAndMeasure() {
  const sidebarRect = await page.evaluate(() => {
    const r = document.querySelector('#mw-mf-page-left').getBoundingClientRect();
    return { right: r.right };
  });
  const point = { x: Math.max(sidebarRect.right + 24, 350), y: 400 };
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { className: el ? String(el.className || '') : null, tagName: el ? el.tagName : null };
  }, point);
  if (!hit.className || !hit.className.includes('main-menu-mask')) {
    throw new Error(`Backdrop touch point did not hit .main-menu-mask: ${JSON.stringify({ point, hit })}`);
  }
  const started = Date.now();
  await page.touchscreen.tap(point.x, point.y);
  await waitChecked(false);
  const uncheckedMs = Date.now() - started;
  await waitForClosed();
  const hiddenMs = Date.now() - started;
  return { uncheckedMs, hiddenMs, point, hit };
}

const propagationAttempts = [];
let ready = false;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&safari_perf=${Date.now()}-${attempt}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#main-menu-input', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('#mw-mf-page-left', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('.main-menu-mask', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(750);
  const current = await state();
  propagationAttempts.push({ attempt, url, state: current });
  if (current && current.sidebarTransitionDuration === '0s' && current.maskTransitionDuration === '0s' && current.closeVisible) {
    ready = true;
    break;
  }
  await page.waitForTimeout(5000);
}

if (!ready) {
  throw new Error(`Live ResourceLoader did not expose the no-transition sidebar CSS: ${JSON.stringify(propagationAttempts)}`);
}

const before = await state();
if (before.hamburgerHitId !== 'main-menu-input') {
  throw new Error(`Expected the native checkbox to be the physical hamburger hit target in WebKit: ${JSON.stringify(before)}`);
}

const openFirst = await tapHamburgerAndMeasure();
const opened = await state();
await page.screenshot({ path: path.join(outDir, 'webkit-sidebar-open.png'), fullPage: false });

const closeX = await tapCloseAndMeasure('.enthusia-native-sidebar-close');
const closedAfterX = await state();

const openSecond = await tapHamburgerAndMeasure();
const reopened = await state();

const closeBackdrop = await tapBackdropAndMeasure();
const closedAfterBackdrop = await state();
await page.screenshot({ path: path.join(outDir, 'webkit-sidebar-closed.png'), fullPage: false });

const timings = { openFirst, closeX, openSecond, closeBackdrop };
const result = {
  propagationAttempts,
  before,
  opened,
  closedAfterX,
  reopened,
  closedAfterBackdrop,
  timings,
  pageErrors
};
fs.writeFileSync(path.join(outDir, 'webkit-performance.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

const measured = {
  openFirstCheckedMs: openFirst.checkedMs,
  openFirstVisibleMs: openFirst.visibleMs,
  closeXUncheckedMs: closeX.uncheckedMs,
  closeXHiddenMs: closeX.hiddenMs,
  openSecondCheckedMs: openSecond.checkedMs,
  openSecondVisibleMs: openSecond.visibleMs,
  closeBackdropUncheckedMs: closeBackdrop.uncheckedMs,
  closeBackdropHiddenMs: closeBackdrop.hiddenMs
};
for (const [name, value] of Object.entries(measured)) {
  if (value > 500) throw new Error(`${name} took ${value}ms in WebKit; expected <= 500ms`);
}
if (!opened.rootOpenClass || opened.quickbarVisibility !== 'hidden') {
  throw new Error(`Open-state class/quickbar sync failed: ${JSON.stringify(opened)}`);
}
if (closedAfterX.rootOpenClass || closedAfterBackdrop.rootOpenClass) {
  throw new Error('Root menu-open class remained after close');
}
if (pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify(pageErrors)}`);

await browser.close();
