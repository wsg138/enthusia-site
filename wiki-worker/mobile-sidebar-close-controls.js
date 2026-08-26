/* Close controls for the restored native Minerva mobile sidebar.
 * The skin remains authoritative for opening the menu. This only supplies the
 * missing close affordances confirmed on the live Minerva DOM: an explicit X
 * and the existing .main-menu-mask backdrop.
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

  function syncExistingState(input) {
    if (typeof window.dispatchEvent === 'function') {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function closeMinervaMenu() {
    const input = toggle();
    if (!input) return false;
    if (input.checked) {
      input.checked = false;
      input.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('enthusia-minerva-menu-open');
      const opener = document.querySelector('#mw-mf-main-menu-button, label[for="main-menu-input"]');
      if (opener) opener.setAttribute('aria-expanded', 'false');
      syncExistingState(input);
    }
    return true;
  }

  function directBrandChild(menu) {
    return Array.from(menu.children).find(function (node) {
      return node.classList && node.classList.contains('enthusia-native-sidebar-brand');
    }) || menu.querySelector('.enthusia-native-sidebar-brand');
  }

  function ensureCloseButton() {
    if (!isMobile() || !isMinerva()) return false;
    const menu = sidebar();
    if (!menu) return false;

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

    let button = header.querySelector('.enthusia-native-sidebar-close');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'enthusia-native-sidebar-close';
      button.setAttribute('aria-label', 'Close menu');
      button.setAttribute('title', 'Close menu');
      button.textContent = '×';
      header.appendChild(button);
    }
    if (button.dataset.enthusiaCloseBound !== '1') {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        closeMinervaMenu();
      });
      button.dataset.enthusiaCloseBound = '1';
    }
    return true;
  }

  function bindBackdrop() {
    if (!isMobile() || !isMinerva()) return false;
    const mask = document.querySelector('.main-menu-mask');
    if (!mask) return false;
    mask.setAttribute('role', 'button');
    mask.setAttribute('aria-label', 'Close menu');
    if (mask.dataset.enthusiaCloseBound === '1') return true;
    mask.addEventListener('click', function (event) {
      const input = toggle();
      if (!input || !input.checked) return;
      event.preventDefault();
      event.stopPropagation();
      closeMinervaMenu();
    });
    mask.dataset.enthusiaCloseBound = '1';
    return true;
  }

  function normalizeCloseControls() {
    if (!isMobile()) return;
    ensureCloseButton();
    bindBackdrop();
  }

  function retryInitialBinding() {
    let remaining = 12;
    const retry = function () {
      normalizeCloseControls();
      remaining -= 1;
      if (remaining > 0 && (!document.querySelector('.enthusia-native-sidebar-close') || !document.querySelector('.main-menu-mask[data-enthusia-close-bound="1"]'))) {
        window.setTimeout(retry, 125);
      }
    };
    retry();
  }

  function start() {
    retryInitialBinding();
    if (mobileMedia) {
      const onChange = function () { normalizeCloseControls(); };
      if (typeof mobileMedia.addEventListener === 'function') mobileMedia.addEventListener('change', onChange);
      else if (typeof mobileMedia.addListener === 'function') mobileMedia.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
