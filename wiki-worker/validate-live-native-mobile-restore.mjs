import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = process.env.WIKI_NATIVE_RESTORE_OUT || 'wiki-native-restore-output';
const chrome = ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox','--disable-dev-shm-usage'] });
const report = { attempts: [] };

async function openFresh(label) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&native_restore=${Date.now()}-${label}-${attempt}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise(r => setTimeout(r, 1800));
    const probe = await page.evaluate(() => ({
      bodyClass: document.body.className,
      top: Boolean(document.querySelector('#mw-mf-main-menu-button, label[for="main-menu-input"]')),
      toggle: Boolean(document.querySelector('#main-menu-input')),
      sidebar: Boolean(document.querySelector('#mw-mf-page-left')),
      customDrawer: Boolean(document.querySelector('.enthusia-mobile-drawer')),
      customReady: document.documentElement.classList.contains('enthusia-custom-mobile-menu-ready'),
      nativeNav: Boolean(document.querySelector('#mw-mf-page-left .enthusia-minerva-nav')),
      bottom: Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).some(b => /menu/i.test(b.textContent || ''))
    }));
    report.attempts.push({ label, attempt, url, probe, errors });
    if (probe.top && probe.toggle && probe.sidebar && probe.nativeNav && probe.bottom && !probe.customDrawer && !probe.customReady) return { page, errors };
    await page.close();
    await new Promise(r => setTimeout(r, 2500));
  }
  throw new Error(`Native mobile restore did not propagate for ${label}`);
}

async function state(page, label) {
  return await page.evaluate(label => {
    const toggle = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    const s = sidebar ? getComputedStyle(sidebar) : null;
    return {
      label,
      checked: Boolean(toggle && toggle.checked),
      rootOpen: document.documentElement.classList.contains('enthusia-minerva-menu-open'),
      sidebarDisplay: s && s.display,
      sidebarVisibility: s && s.visibility,
      sidebarTransform: s && s.transform,
      customDrawerCount: document.querySelectorAll('.enthusia-mobile-drawer').length,
      customReady: document.documentElement.classList.contains('enthusia-custom-mobile-menu-ready')
    };
  }, label);
}

const topSession = await openFresh('top');
report.top = { initial: await state(topSession.page, 'top-initial'), errors: topSession.errors };
await topSession.page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
await new Promise(r => setTimeout(r, 250));
report.top.after = await state(topSession.page, 'top-after');
await topSession.page.screenshot({ path: `${OUT}/live-top-native-restored.png`, fullPage: false });
if (!report.top.after.checked) throw new Error('Top mobile hamburger did not restore native checked state');
if (report.top.after.customDrawerCount !== 0 || report.top.after.customReady) throw new Error('Custom interception is still active after rollback');
await topSession.page.close();

const bottomSession = await openFresh('bottom');
report.bottom = { initial: await state(bottomSession.page, 'bottom-initial'), errors: bottomSession.errors };
const clicked = await bottomSession.page.evaluate(() => {
  const button = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton')).find(b => /menu/i.test(b.textContent || ''));
  if (!button) return false;
  button.click();
  return true;
});
if (!clicked) throw new Error('Bottom Menu button missing');
await new Promise(r => setTimeout(r, 250));
report.bottom.after = await state(bottomSession.page, 'bottom-after');
await bottomSession.page.screenshot({ path: `${OUT}/live-bottom-native-restored.png`, fullPage: false });
if (!report.bottom.after.checked) throw new Error('Bottom Menu no longer opens restored native menu');
if (report.bottom.after.customDrawerCount !== 0 || report.bottom.after.customReady) throw new Error('Custom interception is still active from bottom path');

fs.writeFileSync(`${OUT}/live-native-restore-acceptance.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
await bottomSession.page.close();
await browser.close();
