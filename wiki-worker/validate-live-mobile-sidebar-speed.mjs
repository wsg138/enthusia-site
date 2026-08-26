import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = process.env.WIKI_SPEED_OUT || 'wiki-speed-output';
fs.mkdirSync(OUT, { recursive: true });
const chrome = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function matrixX(transform) {
  if (!transform || transform === 'none') return 0;
  const match = transform.match(/^matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([^,]+),/);
  return match ? Number(match[1]) : NaN;
}

async function state(page) {
  return page.evaluate(() => {
    const toggle = document.querySelector('#main-menu-input');
    const sidebar = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const close = document.querySelector('.enthusia-native-sidebar-close');
    const sideStyle = sidebar ? getComputedStyle(sidebar) : null;
    const maskStyle = mask ? getComputedStyle(mask) : null;
    return {
      checked: Boolean(toggle?.checked),
      sidebarVisibility: sideStyle?.visibility || null,
      sidebarTransform: sideStyle?.transform || null,
      sidebarTransitionProperty: sideStyle?.transitionProperty || null,
      sidebarTransitionDuration: sideStyle?.transitionDuration || null,
      maskTransitionProperty: maskStyle?.transitionProperty || null,
      maskTransitionDuration: maskStyle?.transitionDuration || null,
      closeVisible: Boolean(close && close.getBoundingClientRect().width > 0 && close.getBoundingClientRect().height > 0)
    };
  });
}

function newCssLoaded(s) {
  return s.sidebarTransitionProperty === 'transform' &&
    /(^|,\s*)0\.1s(,|$)/.test(s.sidebarTransitionDuration || '') &&
    !/visibility/.test(s.sidebarTransitionProperty || '') &&
    /opacity/.test(s.maskTransitionProperty || '') &&
    /(^|,\s*)0\.08s(,|$)/.test(s.maskTransitionDuration || '');
}

async function waitFor(page, predicate, timeoutMs = 700) {
  const started = Date.now();
  let last = await state(page);
  while (Date.now() - started <= timeoutMs) {
    if (predicate(last)) return { elapsedMs: Date.now() - started, state: last };
    await sleep(12);
    last = await state(page);
  }
  throw new Error(`Timed out after ${timeoutMs}ms; last state=${JSON.stringify(last)}`);
}

async function loadFresh(page, suffix) {
  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&speed_accept=${Date.now()}-${suffix}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('#mw-mf-main-menu-button, label[for="main-menu-input"]', { timeout: 30000 });
  await page.waitForSelector('#mw-mf-page-left', { timeout: 30000 });
  await page.waitForSelector('.enthusia-native-sidebar-close', { timeout: 30000 });
  return url;
}

async function waitForPublishedCss(page) {
  const attempts = [];
  for (let i = 0; i < 18; i += 1) {
    const url = await loadFresh(page, `css-${i}`);
    const s = await state(page);
    attempts.push({ attempt: i + 1, url, state: s });
    if (newCssLoaded(s)) return attempts;
    await sleep(5000);
  }
  throw new Error(`Published speed CSS never reached ResourceLoader: ${JSON.stringify(attempts.slice(-3))}`);
}

async function openMenu(page) {
  const before = await state(page);
  if (before.checked) throw new Error('Menu unexpectedly starts open');
  const clickStarted = Date.now();
  await page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
  const result = await waitFor(page, s => s.checked && s.sidebarVisibility === 'visible' && Math.abs(matrixX(s.sidebarTransform)) <= 1, 700);
  return { clickToSettledMs: Date.now() - clickStarted, ...result };
}

async function closeWithX(page) {
  const clickStarted = Date.now();
  await page.click('.enthusia-native-sidebar-close');
  const result = await waitFor(page, s => !s.checked && (s.sidebarVisibility === 'hidden' || matrixX(s.sidebarTransform) <= -200), 700);
  return { clickToSettledMs: Date.now() - clickStarted, ...result };
}

async function closeWithBackdrop(page) {
  const box = await page.$eval('#mw-mf-page-left', el => {
    const r = el.getBoundingClientRect();
    return { right: r.right, top: r.top, bottom: r.bottom };
  });
  const x = Math.min(380, Math.max(box.right + 40, 330));
  const y = 320;
  const clickStarted = Date.now();
  await page.mouse.click(x, y);
  const result = await waitFor(page, s => !s.checked && (s.sidebarVisibility === 'hidden' || matrixX(s.sidebarTransform) <= -200), 700);
  return { clickToSettledMs: Date.now() - clickStarted, point: { x, y }, ...result };
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err?.stack || err)));

  const propagationAttempts = await waitForPublishedCss(page);
  await page.screenshot({ path: path.join(OUT, 'speed-closed-before.png'), fullPage: false });

  const open1 = await openMenu(page);
  await page.screenshot({ path: path.join(OUT, 'speed-open-x.png'), fullPage: false });
  const closeX = await closeWithX(page);
  await page.screenshot({ path: path.join(OUT, 'speed-closed-x.png'), fullPage: false });

  const open2 = await openMenu(page);
  const closeBackdrop = await closeWithBackdrop(page);
  await page.screenshot({ path: path.join(OUT, 'speed-closed-backdrop.png'), fullPage: false });

  const timings = {
    openFirstMs: open1.clickToSettledMs,
    closeXMs: closeX.clickToSettledMs,
    openSecondMs: open2.clickToSettledMs,
    closeBackdropMs: closeBackdrop.clickToSettledMs
  };
  for (const [name, ms] of Object.entries(timings)) {
    if (ms > 500) throw new Error(`${name} is too slow: ${ms}ms`);
  }
  if (pageErrors.length) throw new Error(`Browser page errors: ${JSON.stringify(pageErrors)}`);

  const evidence = {
    propagationAttempts,
    computedStyle: propagationAttempts.at(-1).state,
    timings,
    pageErrors
  };
  fs.writeFileSync(path.join(OUT, 'browser-speed.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
