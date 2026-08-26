import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const chrome = ['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');

const browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const url = `https://enthusia.miraheze.org/wiki/Main_Page?useskin=minerva&close_inspect=${Date.now()}`;
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForSelector('#mw-mf-main-menu-button, label[for="main-menu-input"]', { timeout: 30000 });
  await page.click('#mw-mf-main-menu-button, label[for="main-menu-input"]');
  await new Promise(r => setTimeout(r, 700));
  const result = await page.evaluate(() => {
    const serial = node => node ? {
      tag: node.tagName,
      id: node.id || null,
      className: node.className || null,
      text: (node.textContent || '').trim().slice(0, 180),
      ariaLabel: node.getAttribute('aria-label'),
      title: node.getAttribute('title'),
      htmlFor: node.getAttribute('for'),
      type: node.getAttribute('type'),
      outerHTML: node.outerHTML.slice(0, 1200)
    } : null;
    const sidebar = document.querySelector('#mw-mf-page-left');
    const mask = document.querySelector('.main-menu-mask');
    const controls = sidebar ? Array.from(sidebar.querySelectorAll('button,a,label,input,[role="button"]')).map(serial) : [];
    const likelyClose = Array.from(document.querySelectorAll('button,a,label,[role="button"]')).filter(node => {
      const s = `${node.textContent || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`.trim();
      return /(^|\s)(x|×|close|dismiss)(\s|$)/i.test(s);
    }).map(serial);
    return {
      bodyClass: document.body.className,
      toggle: serial(document.querySelector('#main-menu-input')),
      sidebar: serial(sidebar),
      mask: serial(mask),
      controls,
      likelyClose,
      checked: Boolean(document.querySelector('#main-menu-input')?.checked),
      maskStyle: mask ? {
        display: getComputedStyle(mask).display,
        visibility: getComputedStyle(mask).visibility,
        pointerEvents: getComputedStyle(mask).pointerEvents,
        zIndex: getComputedStyle(mask).zIndex,
        position: getComputedStyle(mask).position
      } : null
    };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
