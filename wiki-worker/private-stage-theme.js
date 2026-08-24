/* Private staging pass 6: map Vector Appearance (Automatic/Light/Dark) to the redesign. */
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
      /* Vector's Automatic/OS preference, or older Vector without clientpref classes. */
      scheme = media && media.matches ? 'dark' : 'light';
    }

    if (root.dataset.enthusiaColorScheme !== scheme) {
      root.dataset.enthusiaColorScheme = scheme;
    }
  }

  resolveTheme();

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
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', resolveTheme);
    } else if (typeof media.addListener === 'function') {
      media.addListener(resolveTheme);
    }
  }
})();
