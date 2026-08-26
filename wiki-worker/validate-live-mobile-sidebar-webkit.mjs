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

async function waitForReady() {
  await page.waitForSelector('#main-menu-input', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('#mw-mf-page-left', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('.main-menu-mask', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('.enthusia-native-sidebar-close', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const input = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const inputStyle = getComputedStyle(input);
    const sidebarStyle = getComputedStyle(sidebar);
    const maskStyle = getComputedStyle(mask);
    const r = input.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      checked: input.checked,
      touchAction: inputStyle.touchAction,
      sidebarTransitionDuration: sidebarStyle.transitionDuration,
      maskTransitionDuration: maskStyle.transitionDuration,
      hitId: hit ? hit.id || null : null,
      hitClass: hit ? String(hit.className || '') : null
    };
  });
  if (state.sidebarTransitionDuration !== '0s' || state.maskTransitionDuration !== '0s') {
    throw new Error(`Live no-transition CSS not ready: ${JSON.stringify(state)}`);
  }
  if (state.hitId !== 'main-menu-input') {
    throw new Error(`Native checkbox is not the physical hamburger hit target: ${JSON.stringify(state)}`);
  }
  return state;
}

async function centerOf(selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing element ${sel}`);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
}

async function armTelemetry() {
  await page.evaluate(() => {
    window.__enthTouchTelemetry = [];
    const input = document.querySelector('#main-menu-input');
    ['touchstart', 'touchend', 'pointerdown', 'pointerup', 'click', 'change'].forEach((type) => {
      input.addEventListener(type, () => {
        window.__enthTouchTelemetry.push({ type, at: performance.now(), checked: input.checked });
      }, { capture: true });
    });
  });
}

async function telemetry() {
  return await page.evaluate(() => window.__enthTouchTelemetry || []);
}

async function waitChecked(expected, timeout = 1800) {
  await page.waitForFunction((value) => {
    const input = document.querySelector('#main-menu-input');
    return Boolean(input) && Boolean(input.checked) === value;
  }, expected, { timeout });
}

async function waitOpen(timeout = 1800) {
  await page.waitForFunction(() => {
    const input = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    if (!input || !sidebar || !input.checked) return false;
    const r = sidebar.getBoundingClientRect();
    return getComputedStyle(sidebar).visibility !== 'hidden' && r.left > -8;
  }, null, { timeout });
}

async function waitClosed(timeout = 1800) {
  await page.waitForFunction(() => {
    const input = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    if (!input || !sidebar || input.checked) return false;
    const r = sidebar.getBoundingClientRect();
    return getComputedStyle(sidebar).visibility === 'hidden' || r.right < 8;
  }, null, { timeout });
}

async function tapHamburger() {
  const p = await centerOf('#main-menu-input');
  const start = Date.now();
  await page.touchscreen.tap(p.x, p.y);
  const tapReturnedMs = Date.now() - start;
  await waitChecked(true);
  const checkedMs = Date.now() - start;
  await waitOpen();
  return { tapReturnedMs, checkedMs, visibleMs: Date.now() - start };
}

async function tapClose() {
  const p = await centerOf('.enthusia-native-sidebar-close');
  const start = Date.now();
  await page.touchscreen.tap(p.x, p.y);
  const tapReturnedMs = Date.now() - start;
  await waitChecked(false);
  const uncheckedMs = Date.now() - start;
  await waitClosed();
  return { tapReturnedMs, uncheckedMs, hiddenMs: Date.now() - start };
}

async function tapBackdrop() {
  const r = await page.evaluate(() => {
    const rect = document.querySelector('#mw-mf-page-left').getBoundingClientRect();
    return { right: rect.right };
  });
  const p = { x: Math.max(350, r.right + 24), y: 400 };
  const start = Date.now();
  await page.touchscreen.tap(p.x, p.y);
  const tapReturnedMs = Date.now() - start;
  await waitChecked(false);
  const uncheckedMs = Date.now() - start;
  await waitClosed();
  return { tapReturnedMs, uncheckedMs, hiddenMs: Date.now() - start };
}

async function runScenario(name, manipulateTouchAction) {
  await page.goto(`https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&webkit_touch=${Date.now()}-${name}`, {
    waitUntil: 'domcontentloaded', timeout: 90000
  });
  const before = await waitForReady();

  if (manipulateTouchAction) {
    await page.addStyleTag({ content: `
      body.skin-minerva #main-menu-input,
      body.skin-minerva #mw-mf-main-menu-button {
        touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent !important;
      }
    ` });
  }

  const afterInjection = await page.evaluate(() => ({
    touchAction: getComputedStyle(document.querySelector('#main-menu-input')).touchAction
  }));
  await armTelemetry();

  const openFirst = await tapHamburger();
  const closeX = await tapClose();
  const openSecond = await tapHamburger();
  const closeMask = await tapBackdrop();
  const events = await telemetry();

  return { name, before, afterInjection, openFirst, closeX, openSecond, closeMask, events };
}

const baseline = await runScenario('baseline', false);
const manipulation = await runScenario('manipulation', true);
const result = { baseline, manipulation, pageErrors };
fs.writeFileSync(path.join(outDir, 'webkit-touch-comparison.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

if (manipulation.afterInjection.touchAction !== 'manipulation') {
  throw new Error(`Failed to apply touch-action manipulation: ${JSON.stringify(manipulation.afterInjection)}`);
}
for (const [name, value] of Object.entries({
  firstOpen: manipulation.openFirst.visibleMs,
  xClose: manipulation.closeX.hiddenMs,
  secondOpen: manipulation.openSecond.visibleMs,
  maskClose: manipulation.closeMask.hiddenMs
})) {
  if (value > 500) throw new Error(`Manipulation scenario ${name} took ${value}ms; expected <= 500ms`);
}
if (pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify(pageErrors)}`);

await page.screenshot({ path: path.join(outDir, 'webkit-touch-final.png'), fullPage: false });
await browser.close();
