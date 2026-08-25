/* Mobile-only integration for Miraheze's Minerva-style header.
 * Keeps the existing Enthusia drawer as the single mobile navigation surface.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;
  const LOGO_URL = '/wiki/Special:Redirect/file/Enthusia-logo-v2.png';
  const HAMBURGER_SELECTOR = [
    '#mw-mf-main-menu-button',
    '.main-menu-button',
    '.mw-ui-icon-minerva-mainmenu',
    '.mw-ui-icon-wikimedia-menu-base20',
    '.minerva-header .mw-ui-icon-menu',
    '.minerva-header [aria-label*="menu" i]',
    '.minerva-header [title*="menu" i]',
    'header.header-container [aria-label*="menu" i]',
    'header.header-container [title*="menu" i]',
    'label[for="main-menu-input"]',
    'label[for="mw-mf-main-menu-input"]',
    '#vector-main-menu-dropdown > .vector-dropdown-label'
  ].join(',');

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

  function openEnthusiaDrawer() {
    const drawer = document.querySelector('.enthusia-mobile-drawer');
    const shade = document.querySelector('.enthusia-mobile-shade');
    if (!drawer) return false;

    const nativeToggle = document.querySelector('#main-menu-input, #mw-mf-main-menu-input');
    if (nativeToggle && 'checked' in nativeToggle) nativeToggle.checked = false;

    drawer.classList.add('is-open');
    if (shade) shade.classList.add('is-open');
    root.classList.add('enthusia-mobile-menu-open');
    const close = drawer.querySelector('.enthusia-mobile-drawer-close');
    if (close) window.setTimeout(function () { close.focus(); }, 0);
    return true;
  }

  function nativeHamburger(target) {
    if (!target || !target.closest) return null;
    const button = target.closest(HAMBURGER_SELECTOR);
    if (!button) return null;
    if (button.closest('.enthusia-mobile-drawer, .enthusia-mobile-quickbar')) return null;
    return button;
  }

  /* Intercept before Minerva/Vector handles its own toggle so the top-left
     hamburger opens the exact same Enthusia drawer as the bottom Menu button. */
  document.addEventListener('click', function (event) {
    if (!isMobile()) return;
    const button = nativeHamburger(event.target);
    if (!button || !document.querySelector('.enthusia-mobile-drawer')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEnthusiaDrawer();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (!isMobile() || (event.key !== 'Enter' && event.key !== ' ')) return;
    const button = nativeHamburger(event.target);
    if (!button || !document.querySelector('.enthusia-mobile-drawer')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEnthusiaDrawer();
  }, true);

  function refresh() {
    ensureMobileBrand();
  }

  function start() {
    refresh();
    if (document.body) {
      const observer = new MutationObserver(function () { refresh(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (mobileMedia) {
      if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', refresh);
      else if (typeof mobileMedia.addListener === 'function') mobileMedia.addListener(refresh);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
