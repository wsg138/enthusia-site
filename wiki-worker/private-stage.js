/* User-only visual staging for P2wn. Loaded only from User:P2wn/common.js. */
(function () {
  'use strict';

  const icons = [
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 25l9 8 10-17 10 17 9-8-4 24H17z"/><path d="M20 50h24"/><circle cx="13" cy="22" r="3"/><circle cx="32" cy="13" r="3"/><circle cx="51" cy="22" r="3"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 9l19 8v13c0 13-8 21-19 26C21 51 13 43 13 30V17z"/><path d="M23 31l6 6 13-14"/><path d="M20 18l12 5 12-5"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="25" cy="23" r="9"/><circle cx="43" cy="27" r="7"/><path d="M9 52c1-11 7-17 16-17s15 6 16 17"/><path d="M37 39c2-3 5-5 9-5 7 0 11 6 12 15"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 9h16"/><path d="M28 9v15L16 46c-2 4 1 9 6 9h20c5 0 8-5 6-9L36 24V9"/><path d="M21 42h25"/><rect x="27" y="35" width="5" height="5"/><rect x="36" y="44" width="5" height="5"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 54V25h10v-9h10v9h12v-9h10v38z"/><path d="M18 54V37h12v17"/><path d="M38 36h8v8h-8"/><path d="M10 25h44"/><path d="M20 12h11M42 12h11"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="4"/><path d="M16 45l12-13 8 8 6-6 6 11"/><circle cx="41" cy="23" r="5"/><path d="M14 15h36M15 50h34"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M22 12h20v11c0 11-5 17-10 17s-10-6-10-17z"/><path d="M22 17H12v5c0 8 5 12 12 12M42 17h10v5c0 8-5 12-12 12"/><path d="M32 40v9M22 54h20"/><path d="M29 23l3-5 3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4z"/></svg>',
    '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M27 8h10l2 7 6 3 7-3 5 9-5 5v7l5 5-5 9-7-3-6 3-2 7H27l-2-7-6-3-7 3-5-9 5-5v-7l-5-5 5-9 7 3 6-3z"/><circle cx="32" cy="32" r="9"/></svg>'
  ];

  const navGroups = [
    {
      title: 'Community',
      links: [
        ['Noteable Players', 'Players'],
        ['Noteable Guilds', 'Guilds'],
        ['Staff', 'Staff'],
        ['History & Lore', 'History & Lore'],
        ['Builds', 'Builds'],
        ['Maparts', 'Mapart']
      ]
    },
    {
      title: 'Gameplay',
      links: [
        ['Commands', 'Commands'],
        ['Mechanics', 'Mechanics'],
        ['Events', 'Events'],
        ['Warzone', 'Warzone'],
        ['Death Duels', 'Death Duels'],
        ['Reputation', 'Reputation'],
        ['Playtime', 'Playtime']
      ]
    },
    {
      title: 'Economy',
      links: [
        ['Market', 'Market'],
        ['Raw Gold', 'Raw Gold'],
        ['Voting', 'Voting']
      ]
    }
  ];

  function stageExploreIcons(root) {
    const cards = root.querySelectorAll('.enthusia-home-grid > .enthusia-home-card');
    cards.forEach(function (card, index) {
      if (index >= icons.length || card.querySelector('.enthusia-stage-icon')) return;
      const image = card.querySelector('img');
      if (image) image.classList.add('enthusia-stage-original-icon');
      const holder = document.createElement('div');
      holder.className = 'enthusia-stage-icon';
      holder.innerHTML = icons[index];
      card.insertBefore(holder, card.firstChild);
    });
  }

  function syncExpandedState(drop, summary) {
    const expanded = !drop.classList.contains('mw-collapsed');
    summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function stageDropdown(drop) {
    if (drop.dataset.enthusiaStageBound === '1') return;
    const summary = drop.querySelector('.enthusia-drop-summary');
    if (!summary) return;

    const $drop = window.jQuery ? window.jQuery(drop) : null;
    if (!drop.querySelector('.mw-collapsible-toggle') && $drop && typeof $drop.makeCollapsible === 'function') {
      $drop.makeCollapsible();
    }

    const findToggle = function () {
      return drop.querySelector('.mw-collapsible-toggle a') || drop.querySelector('.mw-collapsible-toggle');
    };

    const activate = function () {
      const toggle = findToggle();
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
    drop.dataset.enthusiaStageBound = '1';
  }

  function stageSidebar() {
    if (!document.body.classList.contains('skin-vector-2022')) return;
    const menu = document.querySelector('#vector-main-menu-pinned-container .vector-main-menu');
    if (!menu || menu.querySelector('.enthusia-stage-sidebar-extra')) return;

    const extra = document.createElement('div');
    extra.className = 'enthusia-stage-sidebar-extra';
    const pageName = window.mw && mw.config ? String(mw.config.get('wgPageName') || '').replace(/_/g, ' ') : '';

    navGroups.forEach(function (group) {
      const section = document.createElement('div');
      section.className = 'enthusia-stage-sidebar-section';

      const heading = document.createElement('div');
      heading.className = 'enthusia-stage-sidebar-title';
      heading.textContent = group.title;
      section.appendChild(heading);

      group.links.forEach(function (pair) {
        const target = pair[0];
        const label = pair[1];
        const link = document.createElement('a');
        link.className = 'enthusia-stage-sidebar-link';
        if (pageName === target) link.classList.add('is-active');
        link.href = window.mw && mw.util ? mw.util.getUrl(target) : '/wiki/' + encodeURIComponent(target.replace(/ /g, '_'));
        link.textContent = label;
        section.appendChild(link);
      });

      extra.appendChild(section);
    });

    menu.appendChild(extra);
  }

  function findUnpinButton(container, featureName) {
    if (!container) return null;
    return container.querySelector('[data-event-name="pinnable-header.' + featureName + '.unpin"]') ||
      container.querySelector('[data-event-name$=".unpin"]') ||
      Array.from(container.querySelectorAll('button')).find(function (button) {
        return button.textContent.trim().toLowerCase() === 'hide';
      }) || null;
  }

  function simplifyVectorLayout() {
    if (!document.body.classList.contains('skin-vector-2022')) return;
    if (window.sessionStorage && sessionStorage.getItem('enthusia-vector-layout-v2') === 'done') return;

    const targets = [
      ['vector-toc-pinned-container', 'vector-toc'],
      ['vector-page-tools-pinned-container', 'vector-page-tools'],
      ['vector-appearance-pinned-container', 'vector-appearance']
    ];

    let changed = false;
    targets.forEach(function (target) {
      const container = document.getElementById(target[0]);
      const button = findUnpinButton(container, target[1]);
      if (container && button && container.offsetParent !== null) {
        button.click();
        changed = true;
      }
    });

    if (window.sessionStorage) sessionStorage.setItem('enthusia-vector-layout-v2', 'done');

    /* Vector persists the unpin choices as user preferences. Give it time to save,
       then reload once so its server-rendered grid no longer reserves those columns. */
    if (changed) {
      window.setTimeout(function () {
        window.location.reload();
      }, 900);
    }
  }

  function apply(root) {
    const node = root && root.nodeType ? root : document;
    stageExploreIcons(node);
    node.querySelectorAll('.enthusia-drop').forEach(stageDropdown);
    stageSidebar();
  }

  function start() {
    simplifyVectorLayout();
    apply(document);

    if (window.mw && mw.hook) {
      mw.hook('wikipage.content').add(function ($content) {
        const root = $content && $content[0] ? $content[0] : document;
        apply(root);
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
