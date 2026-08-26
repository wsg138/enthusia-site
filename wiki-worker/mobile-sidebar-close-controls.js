/* Close affordances for the native Minerva mobile sidebar.
 * Do not mirror menu state or synthesize change events. The visible X is a
 * label for Minerva's native checkbox, and a native label backdrop is left
 * completely untouched. A non-label fallback delegates to input.click().
 */
(function () {
  'use strict';

  const mobileMedia = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;

  function isMobile() {
    return !mobileMedia || mobileMedia.matches;
  }

  function toggle() {
    return document.querySelector('#main-menu-input');
  }

  function sidebar() {
    return document.querySelector('#mw-mf-page-left');
  }

  function isMinerva() {
    return Boolean(document.body && document.body.classList.contains('skin-minerva')) || Boolean(sidebar());
  }

  function directBrandChild(menu) {
    return Array.from(menu.children).find(function (node) {
      return node.classList && node.classList.contains('enthusia-native-sidebar-brand');
    }) || menu.querySelector('.enthusia-native-sidebar-brand');
  }

  function ensureCloseControl() {
    if (!isMobile() || !isMinerva()) return false;
    const menu = sidebar();
    const input = toggle();
    if (!menu || !input) return false;

    let header = menu.querySelector('.enthusia-native-sidebar-header');
    const brand = directBrandChild(menu);
    if (!header) {
      header = document.createElement('div');
      header.className = 'enthusia-native-sidebar-header';
      if (brand && brand.parentNode === menu) {
        menu.insertBefore(header, brand);
        header.appendChild(brand);
      } else {
        menu.prepend(header);
        if (brand) header.appendChild(brand);
      }
    } else if (brand && brand.parentNode !== header) {
      header.prepend(brand);
    }

    let control = header.querySelector('.enthusia-native-sidebar-close');
    if (!control || control.tagName !== 'LABEL') {
      const label = document.createElement('label');
      label.className = 'enthusia-native-sidebar-close';
      label.htmlFor = input.id;
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');
      label.setAttribute('aria-label', 'Close menu');
      label.setAttribute('title', 'Close menu');
      label.textContent = '×';
      if (control) control.replaceWith(label);
      else header.appendChild(label);
      control = label;
    }
    control.htmlFor = input.id;

    if (control.dataset.enthusiaKeyboardBound !== '1') {
      control.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const nativeToggle = toggle();
        if (nativeToggle && nativeToggle.checked) nativeToggle.click();
      });
      control.dataset.enthusiaKeyboardBound = '1';
    }
    return true;
  }

  function normalizeBackdrop() {
    if (!isMobile() || !isMinerva()) return false;
    const mask = document.querySelector('.main-menu-mask');
    const input = toggle();
    if (!mask || !input) return false;

    mask.setAttribute('aria-label', 'Close menu');
    mask.dataset.enthusiaCloseBound = '1';
    if (mask.tagName === 'LABEL') {
      mask.htmlFor = input.id;
      mask.dataset.enthusiaCloseMode = 'native-label';
      return true;
    }

    if (mask.dataset.enthusiaFallbackClickBound !== '1') {
      mask.addEventListener('click', function (event) {
        const nativeToggle = toggle();
        if (!nativeToggle || !nativeToggle.checked) return;
        event.preventDefault();
        event.stopPropagation();
        nativeToggle.click();
      });
      mask.dataset.enthusiaFallbackClickBound = '1';
    }
    mask.dataset.enthusiaCloseMode = 'input-click-fallback';
    return true;
  }

  function normalizeCloseControls() {
    if (!isMobile()) return;
    ensureCloseControl();
    normalizeBackdrop();
  }

  function retryInitialBinding() {
    let remaining = 12;
    const retry = function () {
      normalizeCloseControls();
      remaining -= 1;
      if (remaining > 0 && (!document.querySelector('label.enthusia-native-sidebar-close[for="main-menu-input"]') || !document.querySelector('.main-menu-mask[data-enthusia-close-bound="1"]'))) {
        window.setTimeout(retry, 125);
      }
    };
    retry();
  }

  function start() {
    retryInitialBinding();
    if (mobileMedia) {
      const onChange = function () { retryInitialBinding(); };
      if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', onChange);
      else if (typeof mobileMedia.addListener === 'function') mobileMedia.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
