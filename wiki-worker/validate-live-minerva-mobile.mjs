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

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const attempts = [];
let page = null;
let errors = [];

async function newMobilePage() {
  const p = await browser.newPage();
  await p.setCacheEnabled(false);
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await p.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
  return p;
}

/* MediaWiki/ResourceLoader can serve the previous Common.js bundle briefly after
   an interface edit even when the API readback is already current. Retry fresh,
   cache-disabled mobile page loads for up to about three minutes and only begin
   interaction assertions once the published Minerva marker is actually present. */
for (let attempt = 1; attempt <= 18; attempt += 1) {
  const candidate = await newMobilePage();
  const candidateErrors = [];
  candidate.on('pageerror', (err) => candidateErrors.push(err.stack || err.message));
  const cacheBust = `${Date.now()}-${attempt}`;
  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&enthusia_accept=${cacheBust}`;
  await candidate.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await wait(1400);

  const probe = await candidate.evaluate(() => ({
    bodyClass: document.body?.className || '',
    minervaSidebarClass: Boolean(document.querySelector('#mw-mf-page-left.enthusia-minerva-sidebar')),
    brand: Boolean(document.querySelector('#mw-mf-page-left .enthusia-native-sidebar-brand')),
    nav: Boolean(document.querySelector('#mw-mf-page-left .enthusia-minerva-nav')),
    commonJsRevisionMarker: Boolean(document.querySelector('#mw-mf-page-left .enthusia-minerva-nav'))
  }));
  attempts.push({ attempt, url, probe, pageErrors: candidateErrors });

  if (probe.bodyClass.includes('skin-minerva') && probe.minervaSidebarClass && probe.brand && probe.nav) {
    page = candidate;
    errors = candidateErrors;
    break;
  }

  await candidate.close();
  if (attempt < 18) await wait(10000);
}

if (!page) {
  fs.mkdirSync(process.env.WIKI_MINERVA_MENU_OUT || 'wiki-minerva-mobile-sidebar-output', { recursive: true });
  fs.writeFileSync(
    `${process.env.WIKI_MINERVA_MENU_OUT || 'wiki-minerva-mobile-sidebar-output'}/live-mobile-cache-attempts.json`,
    JSON.stringify(attempts, null, 2)
  );
  await browser.close();
  throw new Error('Published Minerva Common.js did not propagate to a fresh mobile page within the acceptance window');
}

async function state(label) {
  return page.evaluate((label) => {
    const toggle = document.querySelector('#main-menu-input');
    const menu = document.querySelector('#mw-mf-page-left');
    const quickbar = document.querySelector('.enthusia-mobile-quickbar');
    const nav = document.querySelector('#mw-mf-page-left .enthusia-minerva-nav');
    const ms = menu ? getComputedStyle(menu) : null;
    const qs = quickbar ? getComputedStyle(quickbar) : null;
    const rect = menu ? menu.getBoundingClientRect() : null;
    return {
      label,
      checked: Boolean(toggle && toggle.checked),
      menuX: rect ? rect.x : null,
      menuVisibility: ms ? ms.visibility : null,
      menuTransition: ms ? ms.transition : null,
      quickbarOpacity: qs ? qs.opacity : null,
      customDrawer: Boolean(document.querySelector('.enthusia-mobile-drawer')),
      customShade: Boolean(document.querySelector('.enthusia-mobile-shade')),
      minervaSidebarClass: Boolean(document.querySelector('#mw-mf-page-left.enthusia-minerva-sidebar')),
      brand: Boolean(document.querySelector('#mw-mf-page-left .enthusia-native-sidebar-brand')),
      nav: Boolean(nav),
      navText: nav?.textContent || '',
      bodyClass: document.body.className
    };
  }, label);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const report = { cacheAttempts: attempts, errors, initial: await state('live-initial'), top: [], bottom: [] };
assert(report.initial.bodyClass.includes('skin-minerva'), 'Live mobile page is not using Minerva');
assert(report.initial.minervaSidebarClass, 'Live Common.js did not target #mw-mf-page-left');
assert(report.initial.brand, 'Live Minerva sidebar brand missing');
assert(report.initial.nav, 'Live Enthusia navigation missing from Minerva sidebar');
for (const text of ['Main Menu', 'Server Information', 'Community', 'Gameplay', 'Economy', 'Voting']) {
  assert(report.initial.navText.includes(text), `Live Minerva navigation missing ${text}`);
}
assert(!report.initial.customDrawer && !report.initial.customShade, 'Legacy custom drawer/shade returned on live mobile');

await page.click('#mw-mf-main-menu-button');
report.top.push(await state('top+0'));
await wait(60);
report.top.push(await state('top+60'));
await wait(220);
report.top.push(await state('top+280'));
assert(report.top[0].checked, 'Live top hamburger did not check Minerva menu immediately');
assert(report.top[1].menuX > -275, 'Live top hamburger did not begin moving sidebar within 60ms');
assert(Number(report.top[1].quickbarOpacity) < 0.5, 'Live quickbar stayed highlighted above shade after top hamburger');
assert(report.top[2].menuX > -2, 'Live top hamburger sidebar not fully open by 280ms');

await page.evaluate(() => {
  const toggle = document.querySelector('#main-menu-input');
  if (!toggle) throw new Error('Minerva menu checkbox missing');
  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
});
await wait(260);

const bottom = await page.evaluateHandle(() => Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((b) =>
  Array.from(b.querySelectorAll('span')).some((s) => /^menu$/i.test((s.textContent || '').trim()))
));
const bottomElement = bottom.asElement();
assert(bottomElement, 'Live bottom Menu button missing');
await bottomElement.click();
report.bottom.push(await state('bottom+0'));
await wait(60);
report.bottom.push(await state('bottom+60'));
await wait(220);
report.bottom.push(await state('bottom+280'));
assert(report.bottom[0].checked, 'Live bottom Menu did not check Minerva menu immediately');
assert(report.bottom[1].menuX > -275, 'Live bottom Menu did not begin moving sidebar within 60ms');
assert(Number(report.bottom[1].quickbarOpacity) < 0.5, 'Live quickbar stayed highlighted above shade after bottom Menu');
assert(report.bottom[2].menuX > -2, 'Live bottom Menu sidebar not fully open by 280ms');
assert(errors.length === 0, `Live browser page errors: ${errors.join('\n')}`);

const out = process.env.WIKI_MINERVA_MENU_OUT || 'wiki-minerva-mobile-sidebar-output';
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/live-mobile-acceptance.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${out}/live-mobile-cache-attempts.json`, JSON.stringify(attempts, null, 2));
await page.screenshot({ path: `${out}/live-mobile-open.png`, fullPage: false });
console.log(JSON.stringify(report, null, 2));
await browser.close();
