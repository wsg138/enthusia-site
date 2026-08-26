/* Corrections for the public mobile wiki experience.
 * The custom Enthusia drawer is the single mobile navigation surface.
 * Native Minerva/Vector menu controls are intercepted and delegated to the
 * exact bottom Menu button so both entry points always open the same drawer.
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

  const NATIVE_MENU_TOGGLE_SELECTOR = [
    '#main-menu-input',
    '#mw-mf-main-menu-input',
    '#vector-main-menu-dropdown-checkbox',
    'input[type="checkbox"][id*="main-menu" i]'
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
    document.querySelectorAll('.enthusia-site-brand img, .enthusia-mobile-drawer-brand img').forEach(function (image) {
      const current = image.getAttribute('src') || '';
      if (current !== LOGO_URL) image.setAttribute('src', LOGO_URL);
      image.removeAttribute('hidden');
      image.style.display = 'block';
      image.style.opacity = '1';
    });
  }

  function bottomMenuButton() {
    const buttons = Array.from(document.querySelectorAll('.enthusia-mobile-quickbar .enthusia-mobile-quickbutton'));
    return buttons.find(function (button) {
      return Array.from(button.querySelectorAll('span')).some(function (span) {
        return /^menu$/i.test((span.textContent || '').trim());
      });
    }) || null;
  }

  function customDrawerReady() {
    return Boolean(
      bottomMenuButton() &&
      document.querySelector('.enthusia-mobile-drawer') &&
      document.querySelector('.enthusia-mobile-shade')
    );
  }

  function closeNativeMenuState() {
    document.querySelectorAll(NATIVE_MENU_TOGGLE_SELECTOR).forEach(function (toggle) {
      if ('checked' in toggle) toggle.checked = false;
      toggle.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll(NATIVE_MENU_CONTROL_SELECTOR).forEach(function (control) {
      control.setAttribute('aria-expanded', 'false');
    });
    root.classList.remove('enthusia-minerva-menu-open');
  }

  function syncReadyState() {
    const ready = isMobile() && customDrawerReady();
    root.classList.toggle('enthusia-custom-mobile-menu-ready', ready);
    if (ready) closeNativeMenuState();
    repairMobileBrand();
    return ready;
  }

  function openExactBottomMenu() {
    const button = bottomMenuButton();
    if (!button || !customDrawerReady()) return false;
    closeNativeMenuState();
    button.click();
    button.blur();
    return true;
  }

  /* Capture the skin hamburger before its label/checkbox can open the native
     sidebar. Delegate to the exact bottom Menu button instead of duplicating the
     drawer-opening logic. */
  document.addEventListener('click', function (event) {
    if (!isMobile() || !customDrawerReady()) return;
    const target = event.target && event.target.closest ? event.target.closest(NATIVE_MENU_CONTROL_SELECTOR) : null;
    if (!target || target.closest('.enthusia-mobile-quickbar, .enthusia-mobile-drawer')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openExactBottomMenu();
  }, true);

  /* Some MobileFrontend/Vector variants can still toggle the hidden checkbox by
     keyboard or script. Collapse that state immediately and open the same custom
     drawer so no second sidebar can flash or remain active. */
  document.addEventListener('change', function (event) {
    if (!isMobile() || !customDrawerReady()) return;
    const toggle = event.target;
    if (!toggle || !toggle.matches || !toggle.matches(NATIVE_MENU_TOGGLE_SELECTOR) || !toggle.checked) return;
    toggle.checked = false;
    toggle.setAttribute('aria-expanded', 'false');
    openExactBottomMenu();
  }, true);

  function retryUntilReady() {
    let remaining = 16;
    const retry = function () {
      if (syncReadyState()) return;
      remaining -= 1;
      if (remaining > 0) window.setTimeout(retry, 100);
    };
    retry();
  }

  function start() {
    restoreStoredTheme();
    retryUntilReady();

    const themeObserver = new MutationObserver(function () {
      window.setTimeout(function () {
        restoreStoredTheme();
        repairMobileBrand();
      }, 0);
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    if (document.body) {
      const readyObserver = new MutationObserver(function () {
        if (syncReadyState()) readyObserver.disconnect();
      });
      readyObserver.observe(document.body, { childList: true, subtree: true });
    }

    if (mobileMedia) {
      const onMobileChange = function () {
        restoreStoredTheme();
        syncReadyState();
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
