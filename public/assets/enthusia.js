/*
 * Enthusia SMP - shared behaviour for the red and gold pages.
 *
 * Everything here is driven by data attributes in the markup, so pages stay plain HTML:
 *   data-menu / data-nav-toggle            header menus and the phone Menu button
 *   data-copy-ip                           copies the server address and shows the toast
 *   data-switch + data-switch-panel        tab rows and filters (one group name, one value each)
 *   data-slide + data-slide-to/-step       slideshows (hero, galleries)
 *   data-status                            live server status from mcstatus.io
 *   data-discord-count                     online count from the Discord widget
 *   data-board                             leaderboards from /api/leaderboards/...
 *   data-vid                               video of the week (assets/video-rotation.js)
 *   data-vote                              vote listing tracker
 *
 * Seasonal skins (assets/skins/) are off unless the address ends in ?skin=<name> or the <html> tag
 * carries data-skin="<name>".
 *
 * The site sends "script-src 'self'", so there are no inline scripts or inline handlers.
 * Text is always written with textContent; nothing from an API is inserted as HTML.
 */
(function () {
  "use strict";

  var cfg = window.ENTHUSIA || {};
  var doc = document;
  var root = doc.documentElement;
  root.classList.remove("no-js");

  function selectOne(selector, scope) { return (scope || doc).querySelector(selector); }
  function selectAll(selector, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(selector)); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function el(tag, className, content) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }
  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (error) { return false; }
  }
  function formatNumber(value) { return new Intl.NumberFormat("en-US").format(value); }

  /* ------------------------------------------------------------------ links from site-config.js */
  function initConfiguredLinks() {
    var targets = { store: cfg.tebexUrl, discord: cfg.discordInvite, wiki: cfg.wikiUrl };
    selectAll("[data-link-target]").forEach(function (link) {
      var href = text(targets[link.getAttribute("data-link-target")]);
      if (href && link instanceof HTMLAnchorElement) link.href = href;
    });
    var email = text(cfg.contactEmail);
    selectAll("[data-contact-email]").forEach(function (link) {
      if (!email || !(link instanceof HTMLAnchorElement)) return;
      link.href = "mailto:" + email;
      link.textContent = email;
    });
    selectAll("[data-year]").forEach(function (node) { node.textContent = String(new Date().getFullYear()); });
  }

  /* ------------------------------------------------------------------ header menus */
  function initNavigation() {
    var nav = selectOne("#site-nav");
    var toggle = selectOne("[data-nav-toggle]");
    var buttons = selectAll("[data-menu]");

    function closeMenus(except) {
      buttons.forEach(function (button) {
        if (button === except) return;
        button.setAttribute("aria-expanded", "false");
        button.parentElement.classList.remove("open");
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var open = button.getAttribute("aria-expanded") !== "true";
        closeMenus(button);
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.parentElement.classList.toggle("open", open);
      });
    });

    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        nav.classList.toggle("open", open);
        if (!open) closeMenus();
      });
    }

    doc.addEventListener("click", function (event) {
      if (!event.target.closest(".nav-group")) closeMenus();
    });
    doc.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      var openButton = buttons.filter(function (button) { return button.getAttribute("aria-expanded") === "true"; })[0];
      closeMenus();
      if (openButton) openButton.focus();
    });
  }

  /* ------------------------------------------------------------------ copy the server address */
  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    return new Promise(function (resolve, reject) {
      var area = el("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "absolute";
      area.style.left = "-9999px";
      doc.body.append(area);
      area.select();
      var ok = false;
      try { ok = doc.execCommand("copy"); } catch (error) { ok = false; }
      area.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    });
  }

  function initCopyIp() {
    var ip = text(cfg.serverIp) || "enthusia.net";
    var toast = selectOne("[data-toast]");
    var toastTitle = toast ? selectOne("[data-toast-title]", toast) : null;
    var timer = 0;

    selectAll("[data-server-ip]").forEach(function (node) { node.textContent = ip; });

    function show(message) {
      if (!toast) return;
      if (toastTitle) toastTitle.textContent = message;
      toast.classList.remove("hide");
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { toast.classList.add("hide"); }, 2600);
    }

    selectAll("[data-copy-ip]").forEach(function (button) {
      button.addEventListener("click", function () {
        copyText(ip).then(
          function () { show("Address copied!"); },
          function () { show("Copy failed - the address is:"); }
        );
      });
    });
  }

  /* ------------------------------------------------------------------ tab rows and filters
   * <button data-switch="group" data-value="x" aria-pressed="true">   picks a value
   * <div data-switch-panel="group" data-value="x y">                  shown when its values include the pick
   * A button with data-value="*" shows every panel in the group.
   */
  function applySwitch(group, value) {
    selectAll('[data-switch="' + group + '"]').forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-value") === value ? "true" : "false");
    });
    selectAll('[data-switch-panel="' + group + '"]').forEach(function (panel) {
      var values = (panel.getAttribute("data-value") || "").split(" ");
      panel.classList.toggle("hide", !(value === "*" || values.indexOf(value) !== -1));
    });
    doc.dispatchEvent(new CustomEvent("enthusia:switch", { detail: { group: group, value: value } }));
  }

  function initSwitches() {
    doc.addEventListener("click", function (event) {
      var button = event.target.closest("[data-switch]");
      if (!button) return;
      applySwitch(button.getAttribute("data-switch"), button.getAttribute("data-value"));
    });
  }

  /* ------------------------------------------------------------------ slideshows
   * <img data-slide="name" data-label="..." data-alt="...">           the slides; the one with .show is current
   * <button data-slide-to="name" data-index="2">                      jump to a slide (dots, thumbnails)
   * <button data-slide-step="name" data-step="-1">                    previous / next
   * <span data-slide-label="name">, data-slide-pos, data-slide-alt    filled with the current slide's details
   * An element with data-slide-auto="name" data-interval="7000" turns on autoplay until the visitor takes over.
   * Thumbnails hidden by a filter (class "hide") are skipped by previous / next.
   *
   * A change is a true cross-fade: one of the two pictures is always fully opaque, so the background never
   * shows through, and the incoming picture is loaded and decoded before the fade starts.
   */
  var SLIDE_FADE_MS = 700;      // the longest opacity transition on .heroimg / .gimg in enthusia.css
  function initSlideshow(name) {
    var slides = selectAll('[data-slide="' + name + '"]');
    if (!slides.length) return;
    var jumpers = selectAll('[data-slide-to="' + name + '"]');
    var current = Math.max(0, slides.findIndex(function (slide) { return slide.classList.contains("show"); }));
    var shown = current;        // the slide on screen; trails `current` while the next picture loads
    var request = 0;            // counts changes, so a slow picture cannot land after a newer choice
    var timer = 0;
    var cleanup = 0;

    function settle(image) {
      // Fetch a slide that was left to load lazily, then wait until it can be painted in one go.
      if (image.loading === "lazy") image.loading = "eager";
      var loaded = image.complete && image.naturalWidth > 0 ? Promise.resolve() : new Promise(function (resolve) {
        var done = function () {
          image.removeEventListener("load", done);
          image.removeEventListener("error", done);
          resolve();
        };
        image.addEventListener("load", done);
        image.addEventListener("error", done);
        window.setTimeout(done, 4000);
      });
      return loaded.then(function () { return image.decode ? image.decode().catch(function () {}) : undefined; });
    }

    function snapOff(slide) {
      slide.classList.add("snap");
      slide.classList.remove("show", "hold");
      void slide.offsetWidth;
      slide.classList.remove("snap");
    }

    function paint(from, to) {
      window.clearTimeout(cleanup);
      slides.forEach(function (slide, i) { if (i !== from && i !== to && (slide.classList.contains("show") || slide.classList.contains("hold"))) snapOff(slide); });
      var incoming = slides[to];
      var outgoing = slides[from];
      if (from === to || !outgoing) {
        incoming.classList.add("show");
        return;
      }
      outgoing.classList.remove("hold");
      if (to > from) {
        // The incoming picture is painted above the old one: hold the old one solid and fade the new one in.
        outgoing.classList.add("hold");
        outgoing.classList.remove("show");
        incoming.classList.add("show");
        cleanup = window.setTimeout(function () { snapOff(outgoing); }, SLIDE_FADE_MS + 80);
      } else {
        // The incoming picture is painted below the old one: show it at once and fade the old one away.
        incoming.classList.add("snap", "show");
        void incoming.offsetWidth;
        incoming.classList.remove("snap");
        outgoing.classList.remove("show");
      }
    }

    function warm(index) {
      // Start fetching the slide that previous / next / autoplay will reach, so its fade does not wait.
      for (var i = 1; i <= slides.length; i += 1) {
        var next = (index + i) % slides.length;
        if (allowed(next)) { if (slides[next].loading === "lazy") slides[next].loading = "eager"; return; }
      }
    }

    function allowed(index) {
      var jumper = jumpers.filter(function (button) { return Number(button.getAttribute("data-index")) === index; })[0];
      return !jumper || !jumper.classList.contains("hide");
    }
    function allowedCount() {
      var count = 0;
      for (var i = 0; i < slides.length; i += 1) if (allowed(i)) count += 1;
      return count;
    }
    function positionOf(index) {
      var position = 0;
      for (var i = 0; i <= index; i += 1) if (allowed(i)) position += 1;
      return position;
    }
    function go(index) {
      current = (index + slides.length) % slides.length;
      var mine = (request += 1);
      var target = current;
      settle(slides[target]).then(function () {
        if (mine !== request) return;
        paint(shown, target);
        shown = target;
        warm(target);
      });
      jumpers.forEach(function (button) {
        button.setAttribute("aria-pressed", Number(button.getAttribute("data-index")) === current ? "true" : "false");
      });
      var slide = slides[current];
      selectAll('[data-slide-label="' + name + '"]').forEach(function (node) { node.textContent = slide.getAttribute("data-label") || ""; });
      selectAll('[data-slide-alt="' + name + '"]').forEach(function (node) { node.textContent = slide.getAttribute("data-alt") || slide.getAttribute("alt") || ""; });
      selectAll('[data-slide-pos="' + name + '"]').forEach(function (node) { node.textContent = positionOf(current) + " / " + allowedCount(); });
    }
    function step(direction) {
      var next = current;
      for (var i = 0; i < slides.length; i += 1) {
        next = (next + direction + slides.length) % slides.length;
        if (allowed(next)) break;
      }
      go(next);
    }
    function stopAuto() { window.clearInterval(timer); timer = 0; }

    jumpers.forEach(function (button) {
      button.addEventListener("click", function () { stopAuto(); go(Number(button.getAttribute("data-index"))); });
    });
    selectAll('[data-slide-step="' + name + '"]').forEach(function (button) {
      button.addEventListener("click", function () { stopAuto(); step(Number(button.getAttribute("data-step")) || 1); });
    });
    doc.addEventListener("enthusia:switch", function () {
      if (!allowed(current)) step(1); else go(current);
    });

    var auto = selectOne('[data-slide-auto="' + name + '"]');
    if (auto && !reducedMotion()) {
      timer = window.setInterval(function () { step(1); }, Number(auto.getAttribute("data-interval")) || 7000);
    }
    go(current);
  }

  function initSlideshows() {
    var names = {};
    selectAll("[data-slide]").forEach(function (slide) { names[slide.getAttribute("data-slide")] = true; });
    Object.keys(names).forEach(initSlideshow);
  }

  /* ------------------------------------------------------------------ live server status
   * data-status="state"  Checking / Online / Offline / Unavailable
   * data-status="count"  players online, or --
   * data-status="dot"    the square beside the state (classes: live, off, unknown)
   */
  var STATUS_REFRESH_MS = 60000;

  function initServerStatus() {
    var stateNodes = selectAll('[data-status="state"]');
    var countNodes = selectAll('[data-status="count"]');
    var dotNodes = selectAll('[data-status="dot"]');
    var ip = text(cfg.serverIp);
    if (!stateNodes.length && !countNodes.length) return;

    function paint(state, count) {
      stateNodes.forEach(function (node) {
        node.textContent = state;
        node.classList.toggle("is-off", state !== "Online" && state !== "Checking");
      });
      countNodes.forEach(function (node) { node.textContent = count; });
      dotNodes.forEach(function (node) {
        node.classList.toggle("off", state === "Offline");
        node.classList.toggle("unknown", state === "Checking" || state === "Unavailable");
      });
    }

    function refresh() {
      if (!ip) { paint("Unavailable", "--"); return; }
      fetch("https://api.mcstatus.io/v2/status/java/" + encodeURIComponent(ip))
        .then(function (response) {
          if (!response.ok) throw new Error("status check failed");
          return response.json();
        })
        .then(function (data) {
          if (!data || !data.online) { paint("Offline", "--"); return; }
          var online = data.players && typeof data.players.online === "number" ? String(data.players.online) : "--";
          paint("Online", online);
        })
        .catch(function () { paint("Unavailable", "--"); });
    }

    refresh();
    window.setInterval(refresh, STATUS_REFRESH_MS);
  }

  /* ------------------------------------------------------------------ Discord online count */
  function initDiscordCount() {
    var nodes = selectAll("[data-discord-count]");
    var serverId = text(cfg.discordServerId);
    if (!nodes.length || !serverId) return;
    fetch("https://discord.com/api/guilds/" + encodeURIComponent(serverId) + "/widget.json", { mode: "cors" })
      .then(function (response) {
        if (!response.ok) throw new Error("widget unavailable");
        return response.json();
      })
      .then(function (data) {
        if (typeof data.presence_count !== "number") return;
        nodes.forEach(function (node) {
          node.textContent = formatNumber(data.presence_count) + " online";
          node.hidden = false;
        });
      })
      .catch(function () { /* the card still works without the count */ });
  }

  /* ------------------------------------------------------------------ vote listings opened this visit */
  function initVoteTracker() {
    var rows = selectAll("[data-vote]");
    if (!rows.length) return;
    var counter = selectOne("[data-vote-count]");
    var segments = selectAll("[data-vote-seg]");
    function update() {
      var done = rows.filter(function (row) { return row.classList.contains("done"); }).length;
      if (counter) counter.textContent = done + " / " + rows.length;
      segments.forEach(function (segment, index) { segment.classList.toggle("done", rows[index] && rows[index].classList.contains("done")); });
    }
    rows.forEach(function (row) {
      var link = selectOne("a", row);
      if (link) link.addEventListener("click", function () { row.classList.add("done"); update(); });
    });
    update();
  }

  /* ------------------------------------------------------------------ seasonal skins */
  var SKINS = ["sculk"];

  function initSkin() {
    var name = "";
    try { name = new URLSearchParams(window.location.search).get("skin") || ""; } catch (error) { name = ""; }
    name = name || root.getAttribute("data-skin") || "";
    if (SKINS.indexOf(name) === -1) return;
    var script = doc.currentScript || selectOne('script[src*="assets/enthusia.js"]');
    var base = script ? script.src.replace(/enthusia\.js.*$/, "") : "assets/";
    var sheet = el("link");
    sheet.rel = "stylesheet";
    sheet.href = base + "skins/" + name + ".css";
    var code = el("script");
    code.src = base + "skins/" + name + ".js";
    doc.head.append(sheet, code);
  }

  /* ------------------------------------------------------------------ start */
  function start() {
    initConfiguredLinks();
    initNavigation();
    initCopyIp();
    initSwitches();
    initSlideshows();
    initServerStatus();
    initDiscordCount();


    initVoteTracker();
    initSkin();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
