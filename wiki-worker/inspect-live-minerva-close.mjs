import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const chrome = ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');

const browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err?.stack || err)));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&close_inspect=${Date.now()}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('#mw-mf-main-menu-button, label[for="main-menu-input"]', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const raw = await page.evaluate(async () => {
    const rawUrl = `/w/index.php?title=MediaWiki:Common.js&action=raw&ctype=text/javascript&cb=${Date.now()}`;
    const response = await fetch(rawUrl, { cache: 'no-store', credentials: 'same-origin' });
    const text = await response.text();
    let parseError = null;
    try { new Function(text); } catch (error) { parseError = String(error?.stack || error); }
    return {
      status: response.status,
      length: text.length,
      hasCloseBlock: text.includes('BEGIN ENTHUSIA MOBILE SIDEBAR CLOSE CONTROLS'),
      hasCloseFunction: text.includes('function closeMinervaMenu()'),
      parseError,
      tail: text.slice(-5000)
    };
  });

  await page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
  await new Promise(r => setTimeout(r, 800));

  const result = await page.evaluate(() => {
    const serial = node => node ? {
      tag: node.tagName,
      id: node.id || null,
      className: typeof node.className === 'string' ? node.className : null,
      text: (node.textContent || '').trim().slice(0, 180),
      ariaLabel: node.getAttribute('aria-label'),
      title: node.getAttribute('title'),
      htmlFor: node.getAttribute('for'),
      type: node.getAttribute('type'),
      dataset: { ...node.dataset },
      outerHTML: node.outerHTML.slice(0, 1500)
    } : null;
    const sidebar = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const close = document.querySelector('.enthusia-native-sidebar-close');
    const header = document.querySelector('.enthusia-native-sidebar-header');
    return {
      bodyClass: document.body.className,
      toggle: serial(document.querySelector('#main-menu-input')),
      sidebar: serial(sidebar),
      mask: serial(mask),
      close: serial(close),
      header: serial(header),
      checked: Boolean(document.querySelector('#main-menu-input')?.checked),
      closeCount: document.querySelectorAll('.enthusia-native-sidebar-close').length,
      headerCount: document.querySelectorAll('.enthusia-native-sidebar-header').length,
      maskBound: mask?.dataset.enthusiaCloseBound || null,
      scripts: Array.from(document.scripts).map(s => s.src).filter(Boolean),
      performanceResources: performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /load\.php|Common\.js|common\.js/i.test(name)).slice(-30)
    };
  });

  console.log(JSON.stringify({ url, pageErrors, consoleErrors, raw, result }, null, 2));
} finally {
  await browser.close();
}
