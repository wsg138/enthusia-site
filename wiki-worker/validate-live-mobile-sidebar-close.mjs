import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const OUT = process.env.WIKI_CLOSE_OUT || 'wiki-close-output';
fs.mkdirSync(OUT, { recursive: true });
const chrome = ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');

const browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const evidence = { attempts: [] };

async function openFresh(label) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&close_accept=${Date.now()}-${label}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('#mw-mf-main-menu-button, label[for="main-menu-input"]', { timeout: 30000 });
  await page.waitForSelector('.enthusia-native-sidebar-close', { timeout: 30000 });
  await page.waitForSelector('.main-menu-mask[data-enthusia-close-bound="1"]', { timeout: 30000 });
  return { page, url, errors };
}

async function state(page) {
  return page.evaluate(() => {
    const input = document.querySelector('#main-menu-input');
    const menu = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const close = document.querySelector('.enthusia-native-sidebar-close');
    const box = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      checked: Boolean(input?.checked),
      rootOpen: document.documentElement.classList.contains('enthusia-minerva-menu-open'),
      sidebarVisibility: menu ? getComputedStyle(menu).visibility : null,
      sidebarTransform: menu ? getComputedStyle(menu).transform : null,
      closeVisible: close ? getComputedStyle(close).visibility !== 'hidden' && getComputedStyle(close).display !== 'none' : false,
      closeBox: box(close),
      maskBox: box(mask),
      maskPointerEvents: mask ? getComputedStyle(mask).pointerEvents : null,
      maskBound: mask?.dataset.enthusiaCloseBound || null
    };
  });
}

function requireOpen(s, label) {
  if (!s.checked || !s.rootOpen || s.sidebarVisibility !== 'visible') throw new Error(`${label}: menu did not open: ${JSON.stringify(s)}`);
  if (!s.closeVisible || !s.closeBox || s.closeBox.width < 30 || s.closeBox.height < 30) throw new Error(`${label}: close button is not visibly tappable: ${JSON.stringify(s)}`);
}

function requireClosed(s, label) {
  if (s.checked || s.rootOpen || s.sidebarVisibility === 'visible') throw new Error(`${label}: menu did not close: ${JSON.stringify(s)}`);
}

try {
  {
    const { page, url, errors } = await openFresh('x');
    await page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
    await new Promise(r => setTimeout(r, 350));
    const openState = await state(page);
    requireOpen(openState, 'X open');
    await page.screenshot({ path: path.join(OUT, 'mobile-sidebar-open-before-x.png'), fullPage: false });
    await page.click('.enthusia-native-sidebar-close');
    await new Promise(r => setTimeout(r, 350));
    const closedState = await state(page);
    requireClosed(closedState, 'X close');
    await page.screenshot({ path: path.join(OUT, 'mobile-sidebar-closed-after-x.png'), fullPage: false });
    evidence.x = { url, openState, closedState, errors };
    if (errors.length) throw new Error(`X path page errors: ${errors.join(' | ')}`);
    await page.close();
  }

  {
    const { page, url, errors } = await openFresh('backdrop');
    await page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
    await new Promise(r => setTimeout(r, 350));
    const openState = await state(page);
    requireOpen(openState, 'Backdrop open');
    if (!openState.maskBox || openState.maskBox.width <= 0 || openState.maskPointerEvents === 'none' || openState.maskBound !== '1') {
      throw new Error(`Backdrop is not tappable: ${JSON.stringify(openState)}`);
    }
    await page.screenshot({ path: path.join(OUT, 'mobile-sidebar-open-before-backdrop.png'), fullPage: false });
    await page.click('.main-menu-mask');
    await new Promise(r => setTimeout(r, 350));
    const closedState = await state(page);
    requireClosed(closedState, 'Backdrop close');
    await page.screenshot({ path: path.join(OUT, 'mobile-sidebar-closed-after-backdrop.png'), fullPage: false });
    evidence.backdrop = { url, openState, closedState, errors };
    if (errors.length) throw new Error(`Backdrop path page errors: ${errors.join(' | ')}`);
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'browser-close-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
}
