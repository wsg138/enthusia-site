/* Mobile-only header branding for Miraheze/Vector/Minerva.
 * Navigation is intentionally left native: the top-left hamburger must keep
 * MediaWiki's own click, animation, focus, backdrop, and sidebar behavior.
 */
(function () {
  'use strict';

  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;
  const LOGO_URL = '/wiki/Special:Redirect/file/Enthusia-logo-v2.png';

  function isMobile() {
    return !mobileMedia || mobileMedia.matches;
  }

  function wikiUrl(title) {
    if (window.mw && mw.util && typeof mw.util.getUrl === 'function') return mw.util.getUrl(title);
    return '/wiki/' + String(title).replace(/ /g, '_');
  }

  function makeBrand() {
    const brand = document.createElement('a');
    brand.className = 'enthusia-minerva-brand';
    brand.href = wikiUrl('Main Page');
    brand.setAttribute('aria-label', 'Enthusia SMP home');

    const image = document.createElement('img');
    image.src = LOGO_URL;
    image.alt = '';
    image.width = 30;
    image.height = 30;

    const words = document.createElement('span');
    words.className = 'enthusia-brand-words';
    const name = document.createElement('strong');
    name.textContent = 'Enthusia';
    const smp = document.createElement('span');
    smp.textContent = 'SMP';
    words.append(name, smp);
    brand.append(image, words);
    return brand;
  }

  function mobileHeader() {
    return document.querySelector('.minerva-header') ||
      document.querySelector('header.header-container') ||
      document.querySelector('.header-container');
  }

  function nativeBrand(header) {
    if (!header) return null;
    return header.querySelector('.branding-box') ||
      header.querySelector('.mw-logo') ||
      Array.from(header.querySelectorAll('a[href]')).find(function (link) {
        return /^enthusia(?:\s+smp)?$/i.test((link.textContent || '').trim());
      }) || null;
  }

  function ensureMobileBrand() {
    if (!isMobile() || !document.body) return false;
    const header = mobileHeader();
    if (!header) return false;

    let brand = header.querySelector('.enthusia-minerva-brand');
    if (!brand) {
      brand = makeBrand();
      const existing = nativeBrand(header);
      if (existing && existing.parentNode) {
        existing.insertAdjacentElement('afterend', brand);
      } else {
        const search = header.querySelector('.search-box, .search-button, .mw-ui-icon-search, [aria-label*="search" i]');
        if (search && search.parentNode === header) header.insertBefore(brand, search);
        else header.appendChild(brand);
      }
    }

    const image = brand.querySelector('img');
    if (image && image.getAttribute('src') !== LOGO_URL) image.setAttribute('src', LOGO_URL);
    document.body.classList.add('enthusia-minerva-brand-ready');
    return true;
  }

  function start() {
    ensureMobileBrand();

    if (document.body) {
      const observer = new MutationObserver(function () {
        ensureMobileBrand();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (mobileMedia) {
      const refresh = function () { ensureMobileBrand(); };
      if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', refresh);
      else if (typeof mobileMedia.addListener === 'function') mobileMedia.addListener(refresh);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
