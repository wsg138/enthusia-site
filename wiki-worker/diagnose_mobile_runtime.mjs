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
if (!executablePath) throw new Error(`No Chrome/Chromium found. Tried: ${candidates.join(', ')}`);

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');

const consoleMessages = [];
page.on('console', (msg) => consoleMessages.push(`[console:${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => consoleMessages.push(`[pageerror] ${err.stack || err.message}`));

await page.goto('https://enthusia.miraheze.org/wiki/Main_Page', { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));

async function snapshot(label) {
  return page.evaluate((label) => {
    const input = document.querySelector('#main-menu-input');
    const menu = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const centerMask = document.querySelector('.mw-mf-page-center__mask');
    const quickbar = document.querySelector('.enthusia-mobile-quickbar');
    const customDrawer = document.querySelector('.enthusia-mobile-drawer');
    const customShade = document.querySelector('.enthusia-mobile-shade');
    const top = document.querySelector('#mw-mf-main-menu-button');
    const menuButton = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((b) =>
      Array.from(b.querySelectorAll('span')).some((s) => /^menu$/i.test((s.textContent || '').trim()))
    );
    const style = (el) => el ? getComputedStyle(el) : null;
    const rect = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    const ms = style(menu);
    const masks = style(mask);
    const cms = style(centerMask);
    const qs = style(quickbar);
    return {
      label,
      now: performance.now(),
      bodyClass: document.body.className,
      input: input ? { checked: input.checked, ariaExpanded: input.getAttribute('aria-expanded') } : null,
      menu: menu ? {
        className: menu.className,
        rect: rect(menu),
        display: ms.display,
        visibility: ms.visibility,
        opacity: ms.opacity,
        transform: ms.transform,
        left: ms.left,
        right: ms.right,
        transition: ms.transition,
        zIndex: ms.zIndex,
        children: menu.children.length,
        text: (menu.innerText || '').slice(0, 1200)
      } : null,
      mask: mask ? { rect: rect(mask), display: masks.display, visibility: masks.visibility, opacity: masks.opacity, pointerEvents: masks.pointerEvents, zIndex: masks.zIndex } : null,
      centerMask: centerMask ? { rect: rect(centerMask), display: cms.display, visibility: cms.visibility, opacity: cms.opacity, pointerEvents: cms.pointerEvents, zIndex: cms.zIndex } : null,
      quickbar: quickbar ? { rect: rect(quickbar), opacity: qs.opacity, filter: qs.filter, pointerEvents: qs.pointerEvents } : null,
      customDrawer: Boolean(customDrawer),
      customShade: Boolean(customShade),
      topExists: Boolean(top),
      bottomMenuExists: Boolean(menuButton),
      customNativeClass: Boolean(document.querySelector('#mw-mf-page-left.enthusia-native-sidebar')),
      brandInMinervaMenu: Boolean(document.querySelector('#mw-mf-page-left .enthusia-native-sidebar-brand')),
      vectorMenuExists: Boolean(document.querySelector('#vector-main-menu-dropdown'))
    };
  }, label);
}

async function sampleAfter(prefix) {
  const out = [await snapshot(`${prefix}+0ms`)];
  for (const delay of [50, 200, 500, 1000, 3000]) {
    await new Promise((r) => setTimeout(r, delay - (delay === 50 ? 0 : ({200:50,500:200,1000:500,3000:1000}[delay] || 0))));
    out.push(await snapshot(`${prefix}+${delay}ms`));
  }
  return out;
}

const report = {
  executablePath,
  url: page.url(),
  initial: await snapshot('initial'),
  topClick: [],
  bottomClick: [],
  consoleMessages
};

await page.click('#mw-mf-main-menu-button');
report.topClick = await sampleAfter('top');

// Close through the native label before testing the bottom button.
if (await page.$eval('#main-menu-input', (el) => el.checked)) {
  await page.click('#mw-mf-main-menu-button');
  await new Promise((r) => setTimeout(r, 400));
}

const bottom = await page.evaluateHandle(() => Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find((b) =>
  Array.from(b.querySelectorAll('span')).some((s) => /^menu$/i.test((s.textContent || '').trim()))
));
const bottomEl = bottom.asElement();
if (bottomEl) {
  await bottomEl.click();
  report.bottomClick = await sampleAfter('bottom');
} else {
  report.bottomClick = [{ error: 'Bottom Menu button not found' }];
}

report.consoleMessages = consoleMessages;
fs.mkdirSync('mobile-markup-diagnostic', { recursive: true });
fs.writeFileSync('mobile-markup-diagnostic/runtime.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: 'mobile-markup-diagnostic/runtime-final.png', fullPage: false });
await browser.close();
