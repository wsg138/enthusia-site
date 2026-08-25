/* Enthusia public Vector behavior.
 * Keeps native Vector navigation/Appearance controls intact.
 * Enhances the approved wiki components only.
 */
(function () {
  'use strict';

  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

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
    if (root.dataset.enthusiaColorScheme !== scheme) {
      root.dataset.enthusiaColorScheme = scheme;
    }
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

  function enhance(rootNode) {
    const scope = rootNode && rootNode.querySelectorAll ? rootNode : document;
    scope.querySelectorAll('.enthusia-drop').forEach(enhanceDropdown);
    scope.querySelectorAll(CARD_SELECTOR).forEach(enhanceCard);
  }

  function start() {
    /* Old private staging used this key while automatically unpinning Vector panels.
       The public site no longer manipulates those native controls. */
    try { window.sessionStorage.removeItem('enthusia-vector-layout-v2'); } catch (e) {}
    enhance(document);
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
