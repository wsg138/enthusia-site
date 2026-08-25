/* Enthusia public Vector 2022 interactions. */
(function () {
  'use strict';

  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const CARD_SELECTOR = [
    '.enthusia-home-card',
    '.enthusia-wiki .topic-card',
    '.enthusia-wiki .fact-grid > div'
  ].join(',');

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
      scheme = media && media.matches ? 'dark' : 'light';
    }
    root.dataset.enthusiaColorScheme = scheme;
  }

  function syncExpandedState(drop, summary) {
    summary.setAttribute('aria-expanded', drop.classList.contains('mw-collapsed') ? 'false' : 'true');
  }

  function bindDropdown(drop) {
    if (drop.dataset.enthusiaBound === '1') return;
    const summary = drop.querySelector('.enthusia-drop-summary');
    if (!summary) return;

    const $drop = window.jQuery ? window.jQuery(drop) : null;
    if (!drop.querySelector('.mw-collapsible-toggle') && $drop && typeof $drop.makeCollapsible === 'function') {
      $drop.makeCollapsible();
    }

    function activate() {
      const toggle = drop.querySelector('.mw-collapsible-toggle a') || drop.querySelector('.mw-collapsible-toggle');
      if (!toggle) return;
      toggle.click();
      window.setTimeout(function () { syncExpandedState(drop, summary); }, 0);
    }

    summary.setAttribute('role', 'button');
    summary.setAttribute('tabindex', '0');
    syncExpandedState(drop, summary);
    summary.addEventListener('click', function (event) {
      if (event.target.closest('a,button,input,select,textarea,label')) return;
      activate();
    });
    summary.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
    new MutationObserver(function () { syncExpandedState(drop, summary); })
      .observe(drop, { attributes: true, attributeFilter: ['class'] });
    drop.dataset.enthusiaBound = '1';
  }

  function uniqueDestination(card) {
    const destinations = Array.from(new Set(
      Array.from(card.querySelectorAll('a[href]')).map(function (link) { return link.href; }).filter(Boolean)
    ));
    return destinations.length === 1 ? destinations[0] : null;
  }

  function makeCardClickable(card) {
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
      if (event.ctrlKey || event.metaKey) {
        window.open(destination, '_blank', 'noopener');
      } else {
        window.location.assign(destination);
      }
    });
    card.addEventListener('keydown', function (event) {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      window.location.assign(destination);
    });
  }

  function enhance(scope) {
    const node = scope && scope.querySelectorAll ? scope : document;
    node.querySelectorAll('.enthusia-drop').forEach(bindDropdown);
    node.querySelectorAll(CARD_SELECTOR).forEach(makeCardClickable);
  }

  function storageGet(key) {
    try { return window.localStorage ? localStorage.getItem(key) : null; } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { if (window.localStorage) localStorage.setItem(key, value); } catch (_) {}
  }

  function restoreAppearanceOnce() {
    if (!document.body || !document.body.classList.contains('skin-vector-2022')) return;
    const migrationKey = 'enthusia-appearance-restored-v1';
    if (storageGet(migrationKey) === 'done') return;

    const pinned = document.getElementById('vector-appearance-pinned-container');
    if (pinned && pinned.children.length > 0) {
      storageSet(migrationKey, 'done');
      return;
    }

    const pin = document.querySelector('[data-event-name="pinnable-header.vector-appearance.pin"]') ||
      document.querySelector('#vector-appearance-dropdown [data-event-name$=".pin"]');
    if (pin) {
      pin.click();
      window.setTimeout(function () {
        const after = document.getElementById('vector-appearance-pinned-container');
        if (after && after.children.length > 0) storageSet(migrationKey, 'done');
      }, 300);
    }
  }

  function start() {
    resolveTheme();
    enhance(document);
    window.setTimeout(restoreAppearanceOnce, 250);

    if (window.mw && mw.hook) {
      mw.hook('wikipage.content').add(function ($content) {
        enhance($content && $content[0] ? $content[0] : document);
      });
    }
  }

  const observer = new MutationObserver(resolveTheme);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  if (document.body) {
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      resolveTheme();
    }, { once: true });
  }

  if (media) {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', resolveTheme);
    else if (typeof media.addListener === 'function') media.addListener(resolveTheme);
  }

  if (window.mw && mw.loader) {
    mw.loader.using(['jquery.makeCollapsible', 'mediawiki.util']).then(start, start);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
