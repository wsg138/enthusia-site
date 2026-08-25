/* Corrections for the public mobile Vector experience.
 * Loaded after the existing Enthusia global behavior so it can safely repair
 * the anonymous mobile theme fallback and enrich Vector's own hamburger menu.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const THEME_KEY = 'enthusia-mobile-theme';
  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;

  const NAV_GROUPS = [
    ['Main Menu', [
      ['Main Page', 'Main Page'],
      ['Server Information', 'Server Information'],
      ['Commands', 'Commands'],
      ['Mechanics', 'Mechanics']
    ]],
    ['Community', [
      ['Players', 'Noteable Players'],
      ['Guilds', 'Noteable Guilds'],
      ['Staff', 'Staff'],
      ['History & Lore', 'History & Lore'],
      ['Builds', 'Builds'],
      ['Mapart', 'Maparts']
    ]],
    ['Gameplay', [
      ['Commands', 'Commands'],
      ['Mechanics', 'Mechanics'],
      ['Events', 'Events'],
      ['Warzone', 'Warzone'],
      ['Death Duels', 'Death Duels'],
      ['Reputation', 'Reputation'],
      ['Playtime', 'Playtime']
    ]],
    ['Economy', [
      ['Market', 'Market'],
      ['Raw Gold', 'Raw Gold'],
      ['Voting', 'Voting']
    ]]
  ];

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

  function wikiUrl(title) {
    if (window.mw && mw.util && typeof mw.util.getUrl === 'function') return mw.util.getUrl(title);
    return '/wiki/' + String(title).replace(/ /g, '_');
  }

  function makeNativeMenuSections() {
    const wrap = document.createElement('div');
    wrap.className = 'enthusia-native-menu-sections';
    NAV_GROUPS.forEach(function (group) {
      const section = document.createElement('section');
      section.className = 'enthusia-native-menu-section';
      const heading = document.createElement('h3');
      heading.textContent = group[0];
      section.appendChild(heading);
      group[1].forEach(function (item) {
        const link = document.createElement('a');
        link.href = wikiUrl(item[1]);
        link.textContent = item[0];
        section.appendChild(link);
      });
      wrap.appendChild(section);
    });
    return wrap;
  }

  function nativeHamburgerContent() {
    return document.querySelector('#vector-main-menu-dropdown .vector-dropdown-content') ||
      document.querySelector('.vector-main-menu-dropdown .vector-dropdown-content') ||
      document.querySelector('#vector-main-menu-dropdown .vector-menu-content') ||
      document.querySelector('.vector-main-menu-dropdown .vector-menu-content');
  }

  function enrichNativeHamburger() {
    if (mobileMedia && !mobileMedia.matches) return false;
    if (document.querySelector('.enthusia-native-menu-sections')) return true;
    const content = nativeHamburgerContent();
    if (!content) return false;
    content.appendChild(makeNativeMenuSections());
    return true;
  }

  function start() {
    restoreStoredTheme();
    enrichNativeHamburger();

    /* Vector can update its client-preference classes after Common.js starts.
       Keep an explicit mobile choice authoritative when that happens. */
    const observer = new MutationObserver(function () {
      window.setTimeout(function () {
        restoreStoredTheme();
        enrichNativeHamburger();
      }, 0);
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const domObserver = new MutationObserver(function () { enrichNativeHamburger(); });
    if (document.body) domObserver.observe(document.body, { childList: true, subtree: true });

    if (mobileMedia) {
      if (typeof mobileMedia.addEventListener === 'function') {
        mobileMedia.addEventListener('change', function () { enrichNativeHamburger(); });
      } else if (typeof mobileMedia.addListener === 'function') {
        mobileMedia.addListener(function () { enrichNativeHamburger(); });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
