/* Private staging pass 5: make single-destination wiki cards fully clickable. */
(function () {
  'use strict';

  const SELECTOR = [
    '.enthusia-home-card',
    '.enthusia-wiki .topic-card',
    '.enthusia-wiki .fact-grid > div'
  ].join(',');

  function uniqueDestination(card) {
    const links = Array.from(card.querySelectorAll('a[href]'));
    const destinations = Array.from(new Set(links.map((link) => link.href).filter(Boolean)));
    return destinations.length === 1 ? destinations[0] : null;
  }

  function makeClickable(card) {
    if (card.dataset.enthusiaWholeLink === '1') return;
    const destination = uniqueDestination(card);
    if (!destination) return;

    card.dataset.enthusiaWholeLink = '1';
    card.setAttribute('role', 'link');
    if (!card.hasAttribute('tabindex')) card.tabIndex = 0;
    card.style.cursor = 'pointer';

    card.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.target.closest('a, button, input, select, textarea, label')) return;

      if (event.ctrlKey || event.metaKey) {
        window.open(destination, '_blank', 'noopener');
      } else {
        window.location.assign(destination);
      }
    });

    card.addEventListener('keydown', (event) => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      window.location.assign(destination);
    });
  }

  function enhanceCards(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(SELECTOR).forEach(makeClickable);
  }

  enhanceCards(document);
  if (window.mw && mw.hook) {
    mw.hook('wikipage.content').add(enhanceCards);
  }
})();
