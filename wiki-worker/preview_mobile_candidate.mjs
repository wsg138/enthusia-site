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

const candidateJs = fs.readFileSync('wiki-worker/mobile-corrections.js', 'utf8');
const candidateCss = fs.readFileSync('wiki-worker/mobile-native-sidebar.css', 'utf8');
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');

const errors = [];
page.on('pageerror', (err) => errors.push(err.stack || err.message));
await page.goto('https://enthusia.miraheze.org/wiki/Main_Page', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 800));

// Replace the bottom Menu node once to discard listeners from the currently-live
// Common.js. Temporarily mark it as bound so the live observer does not rebind it
// before the candidate script takes over.
await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((b) =>
    Array.from(b.querySelectorAll('span')).some((s) => /^menu$/i.test((s.textContent || '').trim()))
  );
  if (!button) throw new Error('Live bottom Menu button not found');
  const clone = button.cloneNode(true);
  clone.dataset.enthusiaNativeMenuBound = '1';
  button.replaceWith(clone);
});
await new Promise((r) => setTimeout(r, 100));
await page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((b) =>
    Array.from(b.querySelectorAll('span')).some((s) => /^menu$/i.test((s.textContent || '').trim()))
  );
  if (button) delete button.dataset.enthusiaNativeMenuBound;
});

await page.addStyleTag({ content: candidateCss });
await page.addScriptTag({ content: candidateJs });
await new Promise((r) => setTimeout(r, 350));

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
      rootMenuClass: document.documentElement.classList.contains('enthusia-minerva-menu-open'),
      customDrawer: Boolean(document.querySelector('.enthusia-mobile-drawer')),
      customShade: Boolean(document.querySelector('.enthusia-mobile-shade')),
      minervaSidebarClass: Boolean(document.querySelector('#mw-mf-page-left.enthusia-minerva-sidebar')),
      brand: Boolean(document.querySelector('#mw-mf-page-left .enthusia-native-sidebar-brand')),
      nav: Boolean(nav),
      navText: nav?.textContent || '',
      wholeMenuText: menu?.textContent || ''
    };
  }, label);
}

const report = { errors, initial: await state('candidate-initial'), top: [], bottom: [] };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(report.initial.minervaSidebarClass, 'Candidate did not target #mw-mf-page-left');
assert(report.initial.brand, 'Candidate brand missing from Minerva sidebar');
assert(report.initial.nav, 'Candidate Enthusia navigation missing from Minerva sidebar');
for (const text of ['Main Menu', 'Server Information', 'Community', 'Gameplay', 'Economy', 'Voting']) {
  assert(report.initial.navText.includes(text), `Candidate navigation missing ${text}`);
}
assert(!report.initial.customDrawer && !report.initial.customShade, 'Legacy custom drawer/shade still present');

await page.click('#mw-mf-main-menu-button');
report.top.push(await state('top+0'));
await new Promise((r) => setTimeout(r, 60));
report.top.push(await state('top+60'));
await new Promise((r) => setTimeout(r, 220));
report.top.push(await state('top+280'));
assert(report.top[0].checked, 'Top hamburger did not check Minerva menu immediately');
assert(report.top[1].menuX > -275, 'Top hamburger did not begin moving sidebar within 60ms');
assert(Number(report.top[1].quickbarOpacity) < 0.5, 'Bottom quickbar stayed highlighted above Minerva shade');
assert(report.top[2].menuX > -2, 'Top hamburger sidebar not fully open by 280ms');

await page.click('.main-menu-mask');
await new Promise((r) => setTimeout(r, 260));
const closed = await state('closed');
assert(!closed.checked, 'Minerva mask did not close the menu');

const bottom = await page.evaluateHandle(() => Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((b) =>
  Array.from(b.querySelectorAll('span')).some((s) => /^menu$/i.test((s.textContent || '').trim()))
));
const bottomElement = bottom.asElement();
assert(bottomElement, 'Candidate bottom Menu button missing');
await bottomElement.click();
report.bottom.push(await state('bottom+0'));
await new Promise((r) => setTimeout(r, 60));
report.bottom.push(await state('bottom+60'));
await new Promise((r) => setTimeout(r, 220));
report.bottom.push(await state('bottom+280'));
assert(report.bottom[0].checked, 'Bottom Menu did not open Minerva checkbox immediately');
assert(report.bottom[0].rootMenuClass, 'Bottom Menu did not synchronize menu-open state');
assert(report.bottom[1].menuX > -275, 'Bottom Menu did not begin moving sidebar within 60ms');
assert(Number(report.bottom[1].quickbarOpacity) < 0.5, 'Quickbar remained visible above shade after bottom Menu click');
assert(report.bottom[2].menuX > -2, 'Bottom Menu sidebar not fully open by 280ms');
assert(errors.length === 0, `Browser page errors: ${errors.join('\n')}`);

fs.mkdirSync('mobile-markup-diagnostic', { recursive: true });
fs.writeFileSync('mobile-markup-diagnostic/candidate-runtime.json', JSON.stringify(report, null, 2));
await page.screenshot({ path: 'mobile-markup-diagnostic/candidate-open.png', fullPage: false });
console.log(JSON.stringify(report, null, 2));
await browser.close();
