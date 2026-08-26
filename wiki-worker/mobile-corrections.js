/* Corrections for the public mobile wiki experience.
 * Minerva is Miraheze's real default mobile skin; Vector remains a fallback.
 * Keep one native menu, repair mobile theme/branding, and bridge the bottom Menu
 * button to the skin's own menu control without intercepting the top hamburger.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const THEME_KEY = 'enthusia-mobile-theme';
  const LOGO_URL = '/wiki/Special:Redirect/file/Enthusia-logo-v2.png';
  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;

  /* Kept in the same order as wiki-worker/public-sidebar.wiki. The guarded
     publisher validates this list against that file before any live write. */
  const SIDEBAR_GROUPS = [
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

  const VECTOR_MENU_CONTROL_SELECTOR = [
    'label[for="vector-main-menu-dropdown-checkbox"]',
    '#vector-main-menu-dropdown-label',
    '#vector-main-menu-dropdown > .vector-dropdown-label',
    '.vector-main-menu-dropdown > .vector-dropdown-label'
  ].join(',');

  function isMobile() {
    return !mobileMedia || mobileMedia.matches;
  }

  function isMinerva() {
    return Boolean(document.body && document.body.classList.contains('skin-minerva')) ||
      Boolean(document.querySelector('#mw-mf-page-left'));
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

  /* Capture before the older target listener. Anonymous pages can expose a day
     preference class without a usable native radio input; keep our explicit
     mobile choice authoritative in that case. */
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

  function makeBrand() {
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
    return brand;
  }

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

  function makeMinervaNavigation() {
    const nav = document.createElement('nav');
    nav.className = 'enthusia-minerva-nav';
    nav.setAttribute('aria-label', 'Enthusia navigation');

    SIDEBAR_GROUPS.forEach(function (group) {
      const section = document.createElement('section');
      section.className = 'enthusia-minerva-nav-section';

      const heading = document.createElement('h3');
      heading.textContent = group[0];
      section.appendChild(heading);

      const list = document.createElement('ul');
      list.className = 'enthusia-minerva-nav-list';
      group[1].forEach(function (item) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = wikiUrl(item[1]);
        link.textContent = item[0];
        li.appendChild(link);
        list.appendChild(li);
      });
      section.appendChild(list);
      nav.appendChild(section);
    });
    return nav;
  }

  function ensureMinervaSidebar() {
    if (!isMobile()) return false;
    const menu = document.querySelector('#mw-mf-page-left');
    if (!menu) return false;

    menu.classList.add('enthusia-native-sidebar', 'enthusia-minerva-sidebar');
    if (!menu.querySelector('.enthusia-native-sidebar-brand')) {
      menu.prepend(makeBrand());
    }
    if (!menu.querySelector('.enthusia-minerva-nav')) {
      const firstNativeList = menu.querySelector('.toggle-list__list, .hlist');
      const nav = makeMinervaNavigation();
      if (firstNativeList) menu.insertBefore(nav, firstNativeList);
      else menu.appendChild(nav);
    }
    return true;
  }

  function vectorSidebarContent() {
    return document.querySelector('#vector-main-menu-dropdown .vector-dropdown-content') ||
      document.querySelector('.vector-main-menu-dropdown .vector-dropdown-content') ||
      document.querySelector('#vector-main-menu-dropdown .vector-menu-content') ||
      document.querySelector('.vector-main-menu-dropdown .vector-menu-content');
  }

  function ensureVectorSidebarBrand() {
    if (!isMobile() || isMinerva()) return false;
    const content = vectorSidebarContent();
    if (!content) return false;
    content.classList.add('enthusia-native-sidebar');
    if (!content.querySelector('.enthusia-native-sidebar-brand')) content.prepend(makeBrand());
    return true;
  }

  function minervaMenuToggle() {
    return document.querySelector('#main-menu-input');
  }

  function syncMinervaMenuState() {
    const toggle = minervaMenuToggle();
    if (!toggle) {
      root.classList.remove('enthusia-minerva-menu-open');
      return;
    }
    const open = Boolean(toggle.checked);
    root.classList.toggle('enthusia-minerva-menu-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = document.querySelector('#mw-mf-main-menu-button, label[for="main-menu-input"]');
    if (label) label.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function bindMinervaMenuState() {
    const toggle = minervaMenuToggle();
    if (!toggle || toggle.dataset.enthusiaMenuStateBound === '1') return Boolean(toggle);
    toggle.addEventListener('change', syncMinervaMenuState);
    toggle.dataset.enthusiaMenuStateBound = '1';
    syncMinervaMenuState();
    return true;
  }

  function openMinervaMenu() {
    const toggle = minervaMenuToggle();
    if (!toggle) return false;
    if (!toggle.checked) {
      toggle.checked = true;
      syncMinervaMenuState();
      toggle.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      syncMinervaMenuState();
    }
    return true;
  }

  function vectorMenuControl() {
    return Array.from(document.querySelectorAll(VECTOR_MENU_CONTROL_SELECTOR)).find(function (node) {
      return !node.closest('.enthusia-mobile-quickbar, .enthusia-mobile-drawer');
    }) || null;
  }

  function openNativeMenu() {
    if (isMinerva() && openMinervaMenu()) return true;

    const control = vectorMenuControl();
    if (control) {
      control.click();
      return true;
    }

    const toggle = document.querySelector('#vector-main-menu-dropdown-checkbox, #mw-mf-main-menu-input');
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
    ensureMinervaSidebar();
    ensureVectorSidebarBrand();
    bindMinervaMenuState();
    bindBottomMenuToNativeSidebar();
    repairMobileBrand();
  }

  function retryInitialNavigation() {
    let remaining = 8;
    const retry = function () {
      normalizeMobileNavigation();
      remaining -= 1;
      if (remaining > 0 && (!bottomMenuButton() || (isMinerva() && !document.querySelector('#mw-mf-page-left .enthusia-minerva-nav')))) {
        window.setTimeout(retry, 125);
      }
    };
    retry();
  }

  function start() {
    restoreStoredTheme();
    retryInitialNavigation();

    /* Theme classes can be updated after Common.js starts. Observe only those
       attributes; navigation itself is present in Minerva's initial HTML. */
    const themeObserver = new MutationObserver(function () {
      window.setTimeout(function () {
        restoreStoredTheme();
        repairMobileBrand();
      }, 0);
    });
    themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

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
