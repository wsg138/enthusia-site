/* Private staging pass 6: install real Enthusia brand and normalize player cards. */
(function () {
  'use strict';

  const LOGO_URL = 'https://raw.githubusercontent.com/wsg138/enthusia-site/df15f1a7e819d240166c5d4a2a108058a83a05a4/public/assets/enthusia-logo-v2.png';

  function installBrand() {
    const logo = document.querySelector('.mw-logo');
    if (!logo || logo.classList.contains('enthusia-private-brand-ready')) return;

    const img = document.createElement('img');
    img.className = 'enthusia-private-brand-logo';
    img.src = LOGO_URL;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'enthusia-private-brand-name';
    name.textContent = 'Enthusia';

    logo.prepend(img);
    logo.append(name);
    logo.classList.add('enthusia-private-brand-ready');
  }

  function normalizePlayerCards() {
    const pageName = (window.mw && mw.config) ? mw.config.get('wgPageName') : '';
    if (pageName !== 'Noteable_Players') return;

    document.querySelectorAll('.mw-parser-output div[style*="width: 120px"]').forEach(function (card) {
      const img = card.querySelector('img');
      if (!img) return;
      const imageLink = img.closest('a');
      if (!imageLink) return;

      card.classList.add('enthusia-player-card-normalized');
      imageLink.classList.add('enthusia-player-image-link');
    });
  }

  function run() {
    installBrand();
    normalizePlayerCards();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  if (window.mw && mw.hook) {
    mw.hook('wikipage.content').add(function () {
      normalizePlayerCards();
    });
  }
}());
