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
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&close_inspect=${Date.now()}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('#mw-mf-main-menu-button, label[for="main-menu-input"]', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));

  const diagnostic = await page.evaluate(async () => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const siteUrl = resources.find(name => /load\.php/.test(name) && /(?:modules=|%2C)site(?:%7C|%2C|&)/i.test(name));
    let siteResource = null;
    if (siteUrl) {
      const response = await fetch(siteUrl, { cache: 'no-store', credentials: 'same-origin' });
      const text = await response.text();
      siteResource = {
        url: siteUrl,
        status: response.status,
        length: text.length,
        hasCloseBlock: text.includes('ENTHUSIA MOBILE SIDEBAR CLOSE CONTROLS'),
        hasCloseFunction: text.includes('closeMinervaMenu'),
        hasNativeMenuFunction: text.includes('openNativeMenu'),
        snippetAroundClose: (() => {
          const i = text.indexOf('closeMinervaMenu');
          return i >= 0 ? text.slice(Math.max(0, i - 500), i + 1800) : null;
        })()
      };
    }

    const rawUrl = `/w/index.php?title=MediaWiki:Common.js&action=raw&ctype=text/javascript&cb=${Date.now()}`;
    const rawResponse = await fetch(rawUrl, { cache: 'no-store', credentials: 'same-origin' });
    const rawText = await rawResponse.text();
    let parseError = null;
    try { new Function(rawText); } catch (error) { parseError = String(error?.stack || error); }

    return {
      loaderSiteState: window.mw?.loader?.getState ? mw.loader.getState('site') : null,
      siteResource,
      raw: {
        status: rawResponse.status,
        length: rawText.length,
        hasCloseBlock: rawText.includes('BEGIN ENTHUSIA MOBILE SIDEBAR CLOSE CONTROLS'),
        hasCloseFunction: rawText.includes('function closeMinervaMenu()'),
        parseError
      },
      resources: resources.filter(name => /load\.php|Common\.js|common\.js/i.test(name)).slice(-30)
    };
  });

  await page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
  await new Promise(r => setTimeout(r, 800));

  const result = await page.evaluate(() => {
    const mask = document.querySelector('.main-menu-mask');
    const close = document.querySelector('.enthusia-native-sidebar-close');
    const header = document.querySelector('.enthusia-native-sidebar-header');
    return {
      bodyClass: document.body.className,
      checked: Boolean(document.querySelector('#main-menu-input')?.checked),
      closeCount: document.querySelectorAll('.enthusia-native-sidebar-close').length,
      headerCount: document.querySelectorAll('.enthusia-native-sidebar-header').length,
      maskBound: mask?.dataset.enthusiaCloseBound || null,
      maskRole: mask?.getAttribute('role') || null,
      closeHtml: close?.outerHTML || null,
      headerHtml: header?.outerHTML?.slice(0, 2500) || null
    };
  });

  console.log(JSON.stringify({ url, pageErrors, consoleErrors, diagnostic, result }, null, 2));
} finally {
  await browser.close();
}
