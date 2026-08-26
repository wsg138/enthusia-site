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
const out = process.env.WIKI_MINERVA_MENU_OUT || 'wiki-minerva-mobile-sidebar-output';
fs.mkdirSync(out, { recursive: true });

async function newMobilePage() {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  await page.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
  return page;
}

/* MediaWiki/ResourceLoader can serve the previous Common.js/Common.css bundle
   briefly after an interface edit even when the API readback is already current.
   Every interaction path gets its own fresh verified page so a Minerva lifecycle
   navigation cannot invalidate the other path's browser execution context. */
async function openVerifiedPage(purpose) {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const page = await newMobilePage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.stack || err.message));
    const cacheBust = `${Date.now()}-${purpose}-${attempt}`;
    const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&enthusia_accept=${cacheBust}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await wait(1400);

    const probe = await page.evaluate(() => ({
      bodyClass: document.body?.className || '',
      minervaSidebarClass: Boolean(document.querySelector('#mw-mf-page-left.enthusia-minerva-sidebar')),
      brand: Boolean(document.querySelector('#mw-mf-page-left .enthusia-native-sidebar-brand')),
      nav: Boolean(document.querySelector('#mw-mf-page-left .enthusia-minerva-nav'))
    }));
    attempts.push({ purpose, attempt, url, probe, pageErrors });

    if (probe.bodyClass.includes('skin-minerva') && probe.minervaSidebarClass && probe.brand && probe.nav) {
      return { page, errors: pageErrors };
    }

    await page.close();
    if (attempt < 18) await wait(10000);
  }

  fs.writeFileSync(`${out}/live-mobile-cache-attempts.json`, JSON.stringify(attempts, null, 2));
  throw new Error(`Published Minerva assets did not propagate to a fresh ${purpose} mobile page within the acceptance window`);
}

async function state(page, label) {
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
      quickbarVisibility: qs ? qs.visibility : null,
      quickbarTransition: qs ? qs.transition : null,
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

function assertInitial(initial) {
  assert(initial.bodyClass.includes('skin-minerva'), 'Live mobile page is not using Minerva');
  assert(initial.minervaSidebarClass, 'Live Common.js did not target #mw-mf-page-left');
  assert(initial.brand, 'Live Minerva sidebar brand missing');
  assert(initial.nav, 'Live Enthusia navigation missing from Minerva sidebar');
  for (const text of ['Main Menu', 'Server Information', 'Community', 'Gameplay', 'Economy', 'Voting']) {
    assert(initial.navText.includes(text), `Live Minerva navigation missing ${text}`);
  }
  assert(!initial.customDrawer && !initial.customShade, 'Legacy custom drawer/shade returned on live mobile');
}

const report = { cacheAttempts: attempts, top: { errors: [], states: [] }, bottom: { errors: [], states: [] } };

const topSession = await openVerifiedPage('top-hamburger');
report.top.errors = topSession.errors;
report.top.initial = await state(topSession.page, 'top-initial');
assertInitial(report.top.initial);
await topSession.page.click('#mw-mf-main-menu-button');
report.top.states.push(await state(topSession.page, 'top+0'));
await wait(60);
report.top.states.push(await state(topSession.page, 'top+60'));
await wait(220);
report.top.states.push(await state(topSession.page, 'top+280'));
assert(report.top.states[0].checked, 'Live top hamburger did not check Minerva menu immediately');
assert(report.top.states[0].quickbarVisibility === 'hidden', 'Live quickbar did not hide immediately after top hamburger');
assert(Number(report.top.states[0].quickbarOpacity) === 0, 'Live quickbar opacity was not zero immediately after top hamburger');
assert(report.top.states[1].menuX > -275, 'Live top hamburger did not begin moving sidebar within 60ms');
assert(report.top.states[2].menuX > -2, 'Live top hamburger sidebar not fully open by 280ms');
assert(report.top.errors.length === 0, `Live top-hamburger page errors: ${report.top.errors.join('\n')}`);
await topSession.page.close();

const bottomSession = await openVerifiedPage('bottom-menu');
report.bottom.errors = bottomSession.errors;
report.bottom.initial = await state(bottomSession.page, 'bottom-initial');
assertInitial(report.bottom.initial);
const bottomClicked = await bottomSession.page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((candidate) =>
    Array.from(candidate.querySelectorAll('span')).some((span) => /^menu$/i.test((span.textContent || '').trim()))
  );
  if (!button) return false;
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
});
assert(bottomClicked, 'Live bottom Menu button missing');
report.bottom.states.push(await state(bottomSession.page, 'bottom+0'));
await wait(60);
report.bottom.states.push(await state(bottomSession.page, 'bottom+60'));
await wait(220);
report.bottom.states.push(await state(bottomSession.page, 'bottom+280'));
assert(report.bottom.states[0].checked, 'Live bottom Menu did not check Minerva menu immediately');
assert(report.bottom.states[0].quickbarVisibility === 'hidden', 'Live quickbar did not hide immediately after bottom Menu');
assert(Number(report.bottom.states[0].quickbarOpacity) === 0, 'Live quickbar opacity was not zero immediately after bottom Menu');
assert(report.bottom.states[1].menuX > -275, 'Live bottom Menu did not begin moving sidebar within 60ms');
assert(report.bottom.states[2].menuX > -2, 'Live bottom Menu sidebar not fully open by 280ms');
assert(report.bottom.errors.length === 0, `Live bottom-menu page errors: ${report.bottom.errors.join('\n')}`);

fs.writeFileSync(`${out}/live-mobile-acceptance.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${out}/live-mobile-cache-attempts.json`, JSON.stringify(attempts, null, 2));
await bottomSession.page.screenshot({ path: `${out}/live-mobile-open.png`, fullPage: false });
console.log(JSON.stringify(report, null, 2));
await bottomSession.page.close();
await browser.close();
