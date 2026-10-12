/* Desktop-only Vector 2022 integration.
 * Put Vector's native Appearance panel in the same right sidebar as Tools.
 * This deliberately uses Vector's own pinning control and native
 * Automatic / Light / Dark radios instead of duplicating theme logic.
 */
(function () {
  'use strict';

  const desktopMedia = window.matchMedia ? window.matchMedia('(min-width: 801px)') : null;
  const DEFAULTED_KEY = 'enthusia-desktop-appearance-defaulted-v1';
  let attempted = false;
  let observer = null;

  function isDesktop() {
    return !desktopMedia || desktopMedia.matches;
  }

  function storageGet() {
    try {
      return window.localStorage ? localStorage.getItem(DEFAULTED_KEY) : null;
    } catch (e) {
      return null;
    }
  }

  function storageSet() {
    try {
      if (window.localStorage) localStorage.setItem(DEFAULTED_KEY, '1');
    } catch {
      // Storage can be unavailable in private or restricted browser sessions.
    }
  }

  function isVector2022() {
    return Boolean(document.body && document.body.classList.contains('skin-vector-2022'));
  }

  function toolsArePinned() {
    return Boolean(document.querySelector('#vector-page-tools-pinned-container #vector-page-tools'));
  }

  function appearanceIsPinned() {
    return Boolean(document.querySelector('#vector-appearance-pinned-container #vector-appearance'));
  }

  function appearancePinButton() {
    return document.querySelector('[data-event-name="pinnable-header.vector-appearance.pin"]');
  }

  function stopWatching() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function tryPinAppearance() {
    if (!isDesktop() || !isVector2022()) return false;

    /* Only supply the site default once per browser. If a reader later chooses
       Vector's native "hide" action, do not fight that preference on every page. */
    if (storageGet() === '1') {
      stopWatching();
      return true;
    }

    if (appearanceIsPinned()) {
      storageSet();
      stopWatching();
      return true;
    }

    /* Do not create a new right rail when the user's Tools panel is itself
       unpinned. This enhancement follows the layout the user already has. */
    if (!toolsArePinned() || attempted) return false;

    const pin = appearancePinButton();
    if (!pin) return false;

    attempted = true;
    pin.click();

    window.setTimeout(function () {
      if (appearanceIsPinned()) {
        storageSet();
        stopWatching();
      } else {
        attempted = false;
      }
    }, 120);

    return false;
  }

  function start() {
    tryPinAppearance();
    if (storageGet() === '1') return;

    observer = new MutationObserver(function () {
      tryPinAppearance();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true
    });

    /* Vector normally finishes sidebar setup immediately. Do not leave a
       repository-added observer running forever if this is a different skin or
       a future Vector build changes the expected DOM. */
    window.setTimeout(stopWatching, 10000);

    if (desktopMedia) {
      const onDesktopChange = function () {
        attempted = false;
        tryPinAppearance();
      };
      if (typeof desktopMedia.addEventListener === 'function') desktopMedia.addEventListener('change', onDesktopChange);
      else if (typeof desktopMedia.addListener === 'function') desktopMedia.addListener(onDesktopChange);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
