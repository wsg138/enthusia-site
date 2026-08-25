/* Corrections for the public mobile Vector experience.
 * Keeps the anonymous mobile theme fallback authoritative, repairs branding,
 * and makes MediaWiki's native sidebar the single mobile navigation surface.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const THEME_KEY = 'enthusia-mobile-theme';
  const LOGO_URL = '/wiki/Special:Redirect/file/Enthusia-logo-v2.png';
  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;

  const NATIVE_MENU_CONTROL_SELECTOR = [
    '#mw-mf-main-menu-button',
    '.main-menu-button',
    '.mw-ui-icon-minerva-mainmenu',
    '.mw-ui-icon-wikimedia-menu-base20',
    '.minerva-header .mw-ui-icon-menu',
    '.minerva-header [aria-label*="main menu" i]',
    '.minerva-header [title*="main menu" i]',
    'header.header-container [aria-label*="main menu" i]',
    'header.header-container [title*="main menu" i]',
    'label[for="main-menu-input"]',
    'label[for="mw-mf-main-menu-input"]',
    'label[for="vector-main-menu-dropdown-checkbox"]',
    '#vector-main-menu-dropdown-label',
    '#vector-main-menu-dropdown > .vector-dropdown-label',
    '.vector-main-menu-dropdown > .vector-dropdown-label'
  ].join(',');

  function isMobile() {
    return !mobileMedia || mobileMedia.matches;
  }

  function storageGet() {
    try { return window.localStorage ? localStorage.getItem(THEME_KEY) : null; } catch (e) { return null; }
  }

  function storageSet(value) {
    try {
      if (!window.localStorage) return;
      if (value === null) localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, value);
    } catch (e) {}
  }

  function setThemeClasses(mode) {
    const nodes = [root, document.body].filter(Boolean);
    nodes.forEach(function (node) {
      node.classList.toggle('skin-theme-clientpref-night', mode === 'dark');
      node.classList.toggle('skin-theme-clientpref-day', mode === 'light');
      if (mode === 'dark' || mode === 'light') node.classList.remove('skin-theme-clientpref-os');
    });
  }

  function updateThemeLabels(mode) {
    document.querySelectorAll('[data-enthusia-theme-label]').forEach(function (node) {
      node.textContent = mode === 'dark' ? 'Light' : 'Dark';
    });
    document.querySelectorAll('[data-enthusia-theme-icon]').forEach(function (node) {
      node.textContent = mode === 'dark' ? '☀' : '☾';
    });
  }

  function applyTheme(mode, persist) {
    if (mode !== 'dark' && mode !== 'light') return;
    if (persist !== false) storageSet(mode);
    root.dataset.enthusiaColorScheme = mode;
    setThemeClasses(mode);
    updateThemeLabels(mode);
  }

  function restoreStoredTheme() {
    const stored = storageGet();
    if (stored === 'dark' || stored === 'light') applyTheme(stored, false);
  }

  function isEnthusiaThemeButton(target) {
    const button = target && target.closest ? target.closest('button') : null;
    if (!button) return null;
    if (!button.matches('.enthusia-mobile-quickbutton, .enthusia-mobile-drawer-theme')) return null;
    return button.querySelector('[data-enthusia-theme-label]') ? button : null;
  }

  /* Capture before the older target listener. Anonymous Vector pages can expose a
     day preference class without a usable native radio input; the old fallback
     would store dark and then immediately resolve itself back to day. */
  document.addEventListener('click', function (event) {
    const button = isEnthusiaThemeButton(event.target);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = root.dataset.enthusiaColorScheme === 'dark' ? 'dark' : 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark', true);
  }, true);

  function repairMobileBrand() {
    if (!isMobile()) return;
    document.querySelectorAll('.enthusia-site-brand img, .enthusia-mobile-drawer-brand img, .enthusia-native-sidebar-brand img').forEach(function (image) {
      const current = image.getAttribute('src') || '';
      if (current !== LOGO_URL) image.setAttribute('src', LOGO_URL);
      image.removeAttribute('hidden');
      image.style.display = 'block';
      image.style.opacity = '1';
    });
  }

  function wikiUrl(title) {
    if (window.mw && mw.util && typeof mw.util.getUrl === 'function') return mw.util.getUrl(title);
    return '/wiki/' + String(title).replace(/ /g, '_');
  }

  function nativeSidebarContent() {
    return document.querySelector('#vector-main-menu-dropdown .vector-dropdown-content') ||
      document.querySelector('.vector-main-menu-dropdown .vector-dropdown-content') ||
      document.querySelector('#vector-main-menu-dropdown .vector-menu-content') ||
      document.querySelector('.vector-main-menu-dropdown .vector-menu-content');
  }

  function ensureNativeSidebarBrand() {
    if (!isMobile()) return false;
    const content = nativeSidebarContent();
    if (!content) return false;

    content.classList.add('enthusia-native-sidebar');
    if (content.querySelector('.enthusia-native-sidebar-brand')) return true;

    const brand = document.createElement('a');
    brand.className = 'enthusia-native-sidebar-brand';
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
    content.prepend(brand);
    return true;
  }

  function nativeMenuControl() {
    if (!isMobile()) return null;
    return Array.from(document.querySelectorAll(NATIVE_MENU_CONTROL_SELECTOR)).find(function (node) {
      return !node.closest('.enthusia-mobile-quickbar, .enthusia-mobile-drawer');
    }) || null;
  }

  function openNativeMenu() {
    const control = nativeMenuControl();
    if (control) {
      control.click();
      return true;
    }

    const toggle = document.querySelector('#vector-main-menu-dropdown-checkbox, #main-menu-input, #mw-mf-main-menu-input');
    if (toggle && typeof toggle.click === 'function') {
      toggle.click();
      return true;
    }
    return false;
  }

  function bottomMenuButton() {
    const buttons = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton'));
    return buttons.find(function (button) {
      return Array.from(button.querySelectorAll('span')).some(function (span) {
        return /^menu$/i.test((span.textContent || '').trim());
      });
    }) || null;
  }

  function bindBottomMenuToNativeSidebar() {
    if (!isMobile()) return false;
    const button = bottomMenuButton();
    if (!button || button.dataset.enthusiaNativeMenuBound === '1') return Boolean(button);

    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openNativeMenu();
      button.blur();
    }, true);
    button.dataset.enthusiaNativeMenuBound = '1';
    return true;
  }

  function removeLegacyCustomDrawer() {
    if (!isMobile()) return;
    document.querySelectorAll('.enthusia-mobile-drawer, .enthusia-mobile-shade').forEach(function (node) {
      node.remove();
    });
    root.classList.remove('enthusia-mobile-menu-open');
  }

  function normalizeMobileNavigation() {
    if (!isMobile()) return;
    removeLegacyCustomDrawer();
    bindBottomMenuToNativeSidebar();
    ensureNativeSidebarBrand();
    repairMobileBrand();
  }

  function start() {
    restoreStoredTheme();
    normalizeMobileNavigation();

    /* Vector can update its client-preference classes after Common.js starts.
       Keep an explicit mobile choice authoritative when that happens. */
    const themeObserver = new MutationObserver(function () {
      window.setTimeout(function () {
        restoreStoredTheme();
        normalizeMobileNavigation();
      }, 0);
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    let scheduled = false;
    const domObserver = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(function () {
        scheduled = false;
        normalizeMobileNavigation();
      }, 0);
    });
    if (document.body) domObserver.observe(document.body, { childList: true, subtree: true });

    if (mobileMedia) {
      const onMobileChange = function () {
        restoreStoredTheme();
        normalizeMobileNavigation();
      };
      if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', onMobileChange);
      else if (typeof mobileMedia.addListener === 'function') mobileMedia.addListener(onMobileChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
