import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const candidates = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);
const executablePath = candidates.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('No Chrome/Chromium found');

const out = process.env.WIKI_CUSTOM_MENU_OUT || 'wiki-custom-mobile-drawer-output';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const attempts = [];

async function newMobilePage() {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
  return page;
}

async function openVerifiedPage(purpose) {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const page = await newMobilePage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.stack || err.message));
    const cacheBust = `${Date.now()}-${purpose}-${attempt}`;
    const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&enthusia_custom_accept=${cacheBust}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await wait(1400);

    const probe = await page.evaluate(() => ({
      bodyClass: document.body?.className || '',
      ready: document.documentElement.classList.contains('enthusia-custom-mobile-menu-ready'),
      drawers: document.querySelectorAll('.enthusia-mobile-drawer').length,
      shades: document.querySelectorAll('.enthusia-mobile-shade').length,
      quickbars: document.querySelectorAll('.enthusia-mobile-quickbar').length,
      topButton: Boolean(document.querySelector('#mw-mf-main-menu-button')),
      nativeToggle: Boolean(document.querySelector('#main-menu-input'))
    }));
    attempts.push({ purpose, attempt, url, probe, errors });

    if (probe.bodyClass.includes('skin-minerva') && probe.ready && probe.drawers === 1 && probe.shades === 1 && probe.quickbars === 1 && probe.topButton && probe.nativeToggle) {
      return { page, errors };
    }

    await page.close();
    if (attempt < 18) await wait(10000);
  }
  fs.writeFileSync(`${out}/live-custom-cache-attempts.json`, JSON.stringify(attempts, null, 2));
  throw new Error(`Published custom mobile drawer did not propagate for ${purpose} within the acceptance window`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function state(page, label) {
  return page.evaluate((label) => {
    const root = document.documentElement;
    const drawer = document.querySelector('.enthusia-mobile-drawer');
    const shade = document.querySelector('.enthusia-mobile-shade');
    const quickbar = document.querySelector('.enthusia-mobile-quickbar');
    const nativeMenu = document.querySelector('#mw-mf-page-left');
    const nativeToggle = document.querySelector('#main-menu-input');
    const ds = drawer ? getComputedStyle(drawer) : null;
    const ss = shade ? getComputedStyle(shade) : null;
    const qs = quickbar ? getComputedStyle(quickbar) : null;
    const ns = nativeMenu ? getComputedStyle(nativeMenu) : null;
    const rect = drawer ? drawer.getBoundingClientRect() : null;
    return {
      label,
      ready: root.classList.contains('enthusia-custom-mobile-menu-ready'),
      customOpen: root.classList.contains('enthusia-mobile-menu-open'),
      drawerOpenClass: Boolean(drawer && drawer.classList.contains('is-open')),
      shadeOpenClass: Boolean(shade && shade.classList.contains('is-open')),
      drawerX: rect ? rect.x : null,
      drawerTransform: ds ? ds.transform : null,
      shadeOpacity: ss ? ss.opacity : null,
      quickbarOpacity: qs ? qs.opacity : null,
      quickbarVisibility: qs ? qs.visibility : null,
      nativeChecked: Boolean(nativeToggle && nativeToggle.checked),
      nativeDisplay: ns ? ns.display : null,
      drawerCount: document.querySelectorAll('.enthusia-mobile-drawer').length,
      shadeCount: document.querySelectorAll('.enthusia-mobile-shade').length,
      drawerText: drawer?.textContent || ''
    };
  }, label);
}

function assertInitial(initial) {
  assert(initial.ready, 'Custom drawer readiness marker missing');
  assert(initial.drawerCount === 1 && initial.shadeCount === 1, 'Expected exactly one custom drawer and shade');
  assert(!initial.customOpen && !initial.drawerOpenClass && !initial.shadeOpenClass, 'Custom drawer unexpectedly open initially');
  assert(!initial.nativeChecked, 'Native Minerva checkbox unexpectedly checked initially');
  assert(initial.nativeDisplay === 'none', 'Native Minerva sidebar is not suppressed once custom drawer is ready');
  for (const text of ['Main Menu', 'Server Information', 'Community', 'Gameplay', 'Economy', 'Voting']) {
    assert(initial.drawerText.includes(text), `Custom drawer missing ${text}`);
  }
}

async function assertOpened(states, prefix) {
  assert(states[0].customOpen, `${prefix}: root did not mark custom drawer open immediately`);
  assert(states[0].drawerOpenClass && states[0].shadeOpenClass, `${prefix}: custom drawer/shade open classes missing immediately`);
  assert(!states[0].nativeChecked, `${prefix}: native Minerva checkbox opened`);
  assert(states[0].nativeDisplay === 'none', `${prefix}: native Minerva sidebar became visible`);
  assert(states[0].quickbarVisibility === 'hidden' && Number(states[0].quickbarOpacity) === 0, `${prefix}: quickbar stayed visible beneath the shade`);
  assert(states[1].drawerX > -330, `${prefix}: custom drawer did not begin moving by 50ms`);
  assert(states[2].drawerX > -2, `${prefix}: custom drawer not fully open by 220ms`);
}

const report = { attempts, top: { states: [], errors: [] }, bottom: { states: [], errors: [] } };

const topSession = await openVerifiedPage('top');
report.top.errors = topSession.errors;
report.top.initial = await state(topSession.page, 'top-initial');
assertInitial(report.top.initial);
await topSession.page.click('#mw-mf-main-menu-button');
report.top.states.push(await state(topSession.page, 'top+0'));
await wait(50);
report.top.states.push(await state(topSession.page, 'top+50'));
await wait(170);
report.top.states.push(await state(topSession.page, 'top+220'));
await assertOpened(report.top.states, 'top hamburger');
assert(report.top.errors.length === 0, `Top path browser errors: ${report.top.errors.join('\n')}`);
await topSession.page.screenshot({ path: `${out}/live-top-custom-drawer.png`, fullPage: false });
await topSession.page.close();

const bottomSession = await openVerifiedPage('bottom');
report.bottom.errors = bottomSession.errors;
report.bottom.initial = await state(bottomSession.page, 'bottom-initial');
assertInitial(report.bottom.initial);
const bottomClicked = await bottomSession.page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((candidate) =>
    Array.from(candidate.querySelectorAll('span')).some((span) => /^menu$/i.test((span.textContent || '').trim()))
  );
  if (!button) return false;
  button.click();
  return true;
});
assert(bottomClicked, 'Bottom Menu button missing');
report.bottom.states.push(await state(bottomSession.page, 'bottom+0'));
await wait(50);
report.bottom.states.push(await state(bottomSession.page, 'bottom+50'));
await wait(170);
report.bottom.states.push(await state(bottomSession.page, 'bottom+220'));
await assertOpened(report.bottom.states, 'bottom Menu');
assert(report.bottom.errors.length === 0, `Bottom path browser errors: ${report.bottom.errors.join('\n')}`);
await bottomSession.page.screenshot({ path: `${out}/live-bottom-custom-drawer.png`, fullPage: false });
await bottomSession.page.close();

fs.writeFileSync(`${out}/live-custom-mobile-acceptance.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${out}/live-custom-cache-attempts.json`, JSON.stringify(attempts, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
