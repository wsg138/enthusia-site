/* Enthusia public Vector behavior.
 * Keeps native Vector navigation/Appearance controls intact on desktop.
 * Adds a compact mobile brand/menu/theme layer and enhances wiki components.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const FALLBACK_THEME_KEY = 'enthusia-mobile-theme';

  function storageGet(key) {
    try { return window.localStorage ? localStorage.getItem(key) : null; } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try {
      if (!window.localStorage) return;
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }

  function hasThemeClass(name) {
    return root.classList.contains(name) || Boolean(document.body && document.body.classList.contains(name));
  }

  function resolveTheme() {
    let scheme;
    if (hasThemeClass('skin-theme-clientpref-night')) {
      scheme = 'dark';
    } else if (hasThemeClass('skin-theme-clientpref-day')) {
      scheme = 'light';
    } else {
      const fallback = storageGet(FALLBACK_THEME_KEY);
      if (fallback === 'dark' || fallback === 'light') scheme = fallback;
      else scheme = media && media.matches ? 'dark' : 'light';
    }
    if (root.dataset.enthusiaColorScheme !== scheme) {
      root.dataset.enthusiaColorScheme = scheme;
      document.querySelectorAll('[data-enthusia-theme-label]').forEach(function (node) {
        node.textContent = scheme === 'dark' ? 'Light' : 'Dark';
      });
      document.querySelectorAll('[data-enthusia-theme-icon]').forEach(function (node) {
        node.textContent = scheme === 'dark' ? '☀' : '☾';
      });
    }
  }

  function nativeThemeInput(mode) {
    let id;
    let value;
    if (mode === 'light') {
      id = '#skin-client-pref-skin-theme-value-day';
      value = 'day';
    } else if (mode === 'dark') {
      id = '#skin-client-pref-skin-theme-value-night';
      value = 'night';
    } else if (mode === 'auto') {
      id = '#skin-client-pref-skin-theme-value-os';
      value = 'os';
    } else {
      return null;
    }
    return document.querySelector(id) ||
      document.querySelector('input[name*="skin-theme"][value="' + value + '"]');
  }

  function setTheme(mode) {
    const input = nativeThemeInput(mode);
    if (input) {
      storageSet(FALLBACK_THEME_KEY, null);
      if (!input.checked) input.click();
      window.setTimeout(resolveTheme, 40);
      return;
    }
    if (mode === 'auto') storageSet(FALLBACK_THEME_KEY, null);
    else storageSet(FALLBACK_THEME_KEY, mode);
    root.dataset.enthusiaColorScheme = mode === 'auto' ? (media && media.matches ? 'dark' : 'light') : mode;
    resolveTheme();
  }

  function toggleTheme() {
    setTheme(root.dataset.enthusiaColorScheme === 'dark' ? 'light' : 'dark');
  }

  resolveTheme();
  const themeObserver = new MutationObserver(resolveTheme);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  if (document.body) {
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      resolveTheme();
    }, { once: true });
  }
  if (media) {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', resolveTheme);
    else if (typeof media.addListener === 'function') media.addListener(resolveTheme);
  }

  function syncExpandedState(drop, summary) {
    summary.setAttribute('aria-expanded', drop.classList.contains('mw-collapsed') ? 'false' : 'true');
  }

  function enhanceDropdown(drop) {
    if (drop.dataset.enthusiaBound === '1') return;
    const summary = drop.querySelector('.enthusia-drop-summary');
    if (!summary) return;

    const $drop = window.jQuery ? window.jQuery(drop) : null;
    if (!drop.querySelector('.mw-collapsible-toggle') && $drop && typeof $drop.makeCollapsible === 'function') {
      $drop.makeCollapsible();
    }

    const activate = function () {
      const toggle = drop.querySelector('.mw-collapsible-toggle a') || drop.querySelector('.mw-collapsible-toggle');
      if (toggle) {
        toggle.click();
        window.setTimeout(function () { syncExpandedState(drop, summary); }, 0);
      }
    };

    summary.setAttribute('role', 'button');
    summary.setAttribute('tabindex', '0');
    syncExpandedState(drop, summary);
    summary.addEventListener('click', function (event) {
      if (event.target.closest('a,button,input,select,textarea')) return;
      activate();
    });
    summary.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
    new MutationObserver(function () { syncExpandedState(drop, summary); })
      .observe(drop, { attributes: true, attributeFilter: ['class'] });
    drop.dataset.enthusiaBound = '1';
  }

  const CARD_SELECTOR = [
    '.enthusia-home-card',
    '.enthusia-wiki .topic-card',
    '.enthusia-wiki .fact-grid > div'
  ].join(',');

  function uniqueDestination(card) {
    const links = Array.from(card.querySelectorAll('a[href]'));
    const destinations = Array.from(new Set(links.map(function (link) { return link.href; }).filter(Boolean)));
    return destinations.length === 1 ? destinations[0] : null;
  }

  function enhanceCard(card) {
    if (card.dataset.enthusiaWholeLink === '1') return;
    const destination = uniqueDestination(card);
    if (!destination) return;
    card.dataset.enthusiaWholeLink = '1';
    card.setAttribute('role', 'link');
    if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    card.style.cursor = 'pointer';
    card.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.target.closest('a,button,input,select,textarea,label')) return;
      if (event.ctrlKey || event.metaKey) window.open(destination, '_blank', 'noopener');
      else window.location.assign(destination);
    });
    card.addEventListener('keydown', function (event) {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      window.location.assign(destination);
    });
  }

  function wikiUrl(title) {
    if (window.mw && mw.util && typeof mw.util.getUrl === 'function') return mw.util.getUrl(title);
    return '/wiki/' + String(title).replace(/ /g, '_');
  }

  function makeBrand(className) {
    const brand = document.createElement('a');
    brand.className = className;
    brand.href = wikiUrl('Main Page');
    brand.setAttribute('aria-label', 'Enthusia SMP home');

    const image = document.createElement('img');
    image.src = wikiUrl('Special:Redirect/file/Enthusia-logo-v2.png');
    image.alt = '';
    image.width = 34;
    image.height = 34;

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

  function fallbackNavigation() {
    const groups = [
      ['Main Menu', [['Main Page', 'Main Page'], ['Server Information', 'Server Information'], ['Commands', 'Commands'], ['Mechanics', 'Mechanics']]],
      ['Community', [['Players', 'Noteable Players'], ['Guilds', 'Noteable Guilds'], ['Staff', 'Staff'], ['History & Lore', 'History & Lore'], ['Builds', 'Builds'], ['Mapart', 'Maparts']]],
      ['Gameplay', [['Commands', 'Commands'], ['Mechanics', 'Mechanics'], ['Events', 'Events'], ['Warzone', 'Warzone'], ['Death Duels', 'Death Duels'], ['Reputation', 'Reputation'], ['Playtime', 'Playtime']]],
      ['Economy', [['Market', 'Market'], ['Raw Gold', 'Raw Gold'], ['Voting', 'Voting']]]
    ];
    const wrap = document.createElement('div');
    groups.forEach(function (group) {
      const section = document.createElement('section');
      const title = document.createElement('h3');
      title.textContent = group[0];
      section.appendChild(title);
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

  function closeMobileDrawer() {
    const drawer = document.querySelector('.enthusia-mobile-drawer');
    const shade = document.querySelector('.enthusia-mobile-shade');
    if (drawer) drawer.classList.remove('is-open');
    if (shade) shade.classList.remove('is-open');
    document.documentElement.classList.remove('enthusia-mobile-menu-open');
  }

  function openMobileDrawer() {
    const drawer = document.querySelector('.enthusia-mobile-drawer');
    const shade = document.querySelector('.enthusia-mobile-shade');
    if (drawer) drawer.classList.add('is-open');
    if (shade) shade.classList.add('is-open');
    document.documentElement.classList.add('enthusia-mobile-menu-open');
    const close = drawer && drawer.querySelector('.enthusia-mobile-drawer-close');
    if (close) close.focus();
  }

  function buildMobileUx() {
    if (!document.body || document.querySelector('.enthusia-site-brand')) return;

    const headerStart = document.querySelector('.vector-header-start') || document.querySelector('.vector-header');
    if (headerStart) {
      const brand = makeBrand('enthusia-site-brand');
      headerStart.appendChild(brand);
    }

    const shade = document.createElement('button');
    shade.type = 'button';
    shade.className = 'enthusia-mobile-shade';
    shade.setAttribute('aria-label', 'Close navigation');
    shade.addEventListener('click', closeMobileDrawer);

    const drawer = document.createElement('aside');
    drawer.className = 'enthusia-mobile-drawer';
    drawer.setAttribute('aria-label', 'Enthusia navigation');
    const drawerTop = document.createElement('div');
    drawerTop.className = 'enthusia-mobile-drawer-top';
    drawerTop.appendChild(makeBrand('enthusia-mobile-drawer-brand'));
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'enthusia-mobile-drawer-close';
    close.setAttribute('aria-label', 'Close menu');
    close.textContent = '×';
    close.addEventListener('click', closeMobileDrawer);
    drawerTop.appendChild(close);
    drawer.appendChild(drawerTop);

    const nav = document.createElement('nav');
    nav.className = 'enthusia-mobile-nav';
    const nativeMenu = document.querySelector('#vector-main-menu') || document.querySelector('.vector-main-menu');
    if (nativeMenu) {
      const clone = nativeMenu.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('[id]').forEach(function (node) { node.removeAttribute('id'); });
      nav.appendChild(clone);
    } else {
      nav.appendChild(fallbackNavigation());
    }
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a[href]')) closeMobileDrawer();
    });
    drawer.appendChild(nav);

    const drawerTheme = document.createElement('button');
    drawerTheme.type = 'button';
    drawerTheme.className = 'enthusia-mobile-drawer-theme';
    drawerTheme.innerHTML = '<span data-enthusia-theme-icon>☾</span><span>Switch to <b data-enthusia-theme-label>Dark</b> mode</span>';
    drawerTheme.addEventListener('click', toggleTheme);
    drawer.appendChild(drawerTheme);

    const bar = document.createElement('div');
    bar.className = 'enthusia-mobile-quickbar';
    bar.setAttribute('aria-label', 'Mobile wiki controls');

    const menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'enthusia-mobile-quickbutton';
    menuButton.innerHTML = '<span class="enthusia-mobile-quickicon">☰</span><span>Menu</span>';
    menuButton.addEventListener('click', openMobileDrawer);

    const home = document.createElement('a');
    home.className = 'enthusia-mobile-quickbutton';
    home.href = wikiUrl('Main Page');
    home.innerHTML = '<span class="enthusia-mobile-quickicon">⌂</span><span>Home</span>';

    const theme = document.createElement('button');
    theme.type = 'button';
    theme.className = 'enthusia-mobile-quickbutton';
    theme.innerHTML = '<span class="enthusia-mobile-quickicon" data-enthusia-theme-icon>☾</span><span data-enthusia-theme-label>Dark</span>';
    theme.addEventListener('click', toggleTheme);

    bar.append(menuButton, home, theme);
    document.body.append(shade, drawer, bar);
    resolveTheme();

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMobileDrawer();
    });
  }

  function enhance(rootNode) {
    const scope = rootNode && rootNode.querySelectorAll ? rootNode : document;
    scope.querySelectorAll('.enthusia-drop').forEach(enhanceDropdown);
    scope.querySelectorAll(CARD_SELECTOR).forEach(enhanceCard);
  }

  function start() {
    try { window.sessionStorage.removeItem('enthusia-vector-layout-v2'); } catch (e) {}
    enhance(document);
    buildMobileUx();
    if (window.mw && mw.hook) {
      mw.hook('wikipage.content').add(function ($content) {
        enhance($content && $content[0] ? $content[0] : document);
      });
    }
  }

  if (window.mw && mw.loader) {
    mw.loader.using(['jquery.makeCollapsible', 'mediawiki.util']).then(start);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
