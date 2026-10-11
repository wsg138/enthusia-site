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

  function $(selector, scope) { return (scope || doc).querySelector(selector); }
  function $$(selector, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(selector)); }
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
    $$("[data-link-target]").forEach(function (link) {
      var href = text(targets[link.getAttribute("data-link-target")]);
      if (href && link instanceof HTMLAnchorElement) link.href = href;
    });
    var email = text(cfg.contactEmail);
    $$("[data-contact-email]").forEach(function (link) {
      if (!email || !(link instanceof HTMLAnchorElement)) return;
      link.href = "mailto:" + email;
      link.textContent = email;
    });
    $$("[data-year]").forEach(function (node) { node.textContent = String(new Date().getFullYear()); });
  }

  /* ------------------------------------------------------------------ header menus */
  function initNavigation() {
    var nav = $("#site-nav");
    var toggle = $("[data-nav-toggle]");
    var buttons = $$("[data-menu]");

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
    var toast = $("[data-toast]");
    var toastTitle = toast ? $("[data-toast-title]", toast) : null;
    var timer = 0;

    $$("[data-server-ip]").forEach(function (node) { node.textContent = ip; });

    function show(message) {
      if (!toast) return;
      if (toastTitle) toastTitle.textContent = message;
      toast.classList.remove("hide");
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { toast.classList.add("hide"); }, 2600);
    }

    $$("[data-copy-ip]").forEach(function (button) {
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
    $$('[data-switch="' + group + '"]').forEach(function (button) {
      button.setAttribute("aria-pressed", button.getAttribute("data-value") === value ? "true" : "false");
    });
    $$('[data-switch-panel="' + group + '"]').forEach(function (panel) {
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
    var slides = $$('[data-slide="' + name + '"]');
    if (!slides.length) return;
    var jumpers = $$('[data-slide-to="' + name + '"]');
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
      $$('[data-slide-label="' + name + '"]').forEach(function (node) { node.textContent = slide.getAttribute("data-label") || ""; });
      $$('[data-slide-alt="' + name + '"]').forEach(function (node) { node.textContent = slide.getAttribute("data-alt") || slide.getAttribute("alt") || ""; });
      $$('[data-slide-pos="' + name + '"]').forEach(function (node) { node.textContent = positionOf(current) + " / " + allowedCount(); });
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
    $$('[data-slide-step="' + name + '"]').forEach(function (button) {
      button.addEventListener("click", function () { stopAuto(); step(Number(button.getAttribute("data-step")) || 1); });
    });
    doc.addEventListener("enthusia:switch", function () {
      if (!allowed(current)) step(1); else go(current);
    });

    var auto = $('[data-slide-auto="' + name + '"]');
    if (auto && !reducedMotion()) {
      timer = window.setInterval(function () { step(1); }, Number(auto.getAttribute("data-interval")) || 7000);
    }
    go(current);
  }

  function initSlideshows() {
    var names = {};
    $$("[data-slide]").forEach(function (slide) { names[slide.getAttribute("data-slide")] = true; });
    Object.keys(names).forEach(initSlideshow);
  }

  /* ------------------------------------------------------------------ live server status
   * data-status="state"  Checking / Online / Offline / Unavailable
   * data-status="count"  players online, or --
   * data-status="dot"    the square beside the state (classes: live, off, unknown)
   */
  var STATUS_REFRESH_MS = 60000;

  function initServerStatus() {
    var stateNodes = $$('[data-status="state"]');
    var countNodes = $$('[data-status="count"]');
    var dotNodes = $$('[data-status="dot"]');
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
    var nodes = $$("[data-discord-count]");
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

  /* ------------------------------------------------------------------ leaderboards
   * <div data-board="playtime-active-all" data-limit="5" data-layout="list|podium">
   *   <ol data-board-rows></ol>             rows are written here
   *   <div data-board-podium></div>         top three, when data-layout="podium"
   *   <div data-board-state>...</div>       loading / unavailable message with a Retry button
   * The board's endpoint and mode come from window.ENTHUSIA.leaderboards.active in site-config.js.
   */
  function pickNumber() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (value === null || value === undefined || value === "") continue;
      var number = Number(value);
      if (isFinite(number)) return number;
    }
    return null;
  }
  function pickText() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (typeof value === "number" && isFinite(value)) return String(value);
      if (text(value)) return text(value);
    }
    return "";
  }

  function normalizeGuild(entry, index) {
    var level = pickNumber(entry.level, entry.currentLevel, entry.current_level);
    var experience = pickNumber(entry.totalExperience, entry.total_xp, entry.totalExperiencePoints, entry.total_experience);
    var members = pickNumber(entry.memberCount, entry.members, entry.member_count, entry.activeMembers, entry.active_members);
    var score = pickNumber(entry.value, entry.score);
    var name = pickText(entry.name, entry.guildName, entry.guild_name, entry.displayName, entry.display_name, entry.tagPlain, entry.tag, entry.entityName, entry.entity_name);
    var uuids = entry.topMemberUuids || entry.top_member_uuids || entry.memberUuids || entry.member_uuids;
    return {
      name: name,
      detail: members !== null ? formatNumber(members) + " members" : "",
      value: level !== null ? "Level " + formatNumber(level) : experience !== null ? formatNumber(experience) + " XP" : score !== null ? formatNumber(score) : "",
      banner: entry.banner && typeof entry.banner === "object" ? entry.banner : null,
      headId: Array.isArray(uuids) ? text(uuids[0]) : "",
      rank: pickNumber(entry.rank) || index + 1
    };
  }

  function normalizePlayer(entry, index) {
    var username = pickText(entry.username, entry.player, entry.uuid);
    return {
      name: pickText(entry.displayName, entry.username, entry.name),
      detail: pickText(entry.subtext, entry.subtitle, entry.description),
      value: pickText(entry.formattedValue, entry.formatted, entry.stat, entry.score, entry.amount, entry.hours, entry.balance, entry.experience, entry.level),
      banner: null,
      headId: username || pickText(entry.displayName, entry.name),
      rank: pickNumber(entry.rank) || index + 1
    };
  }

  function normalizeEntries(payload, board) {
    var list = Array.isArray(payload) ? payload : (payload && (payload.players || payload.guilds || payload.entries || payload.data)) || [];
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (entry) { return entry && typeof entry === "object"; })
      .map(function (entry, index) { return board.mode === "guild" ? normalizeGuild(entry, index) : normalizePlayer(entry, index); })
      .filter(function (entry) { return entry.name && entry.value; });
  }

  function boardEndpoint(board) {
    var endpoint = text(board.endpoint) || (text(board.source) ? "/api/leaderboards/" + text(board.source) : "");
    if (endpoint.indexOf("/api/leaderboards/") !== 0 || endpoint.indexOf("//") === 0 || endpoint.indexOf("://") !== -1) return "";
    return endpoint;
  }

  function entryVisual(entry, size) {
    if (entry.banner && window.EnthusiaGuildBannerRenderer) {
      var banner = window.EnthusiaGuildBannerRenderer.create(entry.banner, entry.name + " banner", "guild-banner");
      if (banner) return banner;
    }
    if (!entry.headId) return el("span", "guild-mark", entry.name.slice(0, 2).toUpperCase());
    var head = el("img", "px lb-head");
    head.src = "https://minotar.net/helm/" + encodeURIComponent(entry.headId) + "/" + size;
    head.alt = "";
    head.width = size;
    head.height = size;
    head.loading = "lazy";
    head.decoding = "async";
    return head;
  }

  function boardRow(entry, rank, isTop) {
    var item = el("li", "row lb-row" + (isTop ? " top" : ""));
    var name = el("span", "lb-name");
    name.append(el("span", "lb-name-text", entry.name));
    if (entry.detail) name.append(el("small", "", entry.detail));
    item.append(el("span", "slot lb-rank", rank), entryVisual(entry, 64), name, el("span", "lb-value", entry.value));
    return item;
  }

  function podiumVisual(entry) {
    if (entry.banner || !entry.headId) return entryVisual(entry, 64);
    var body = el("img", "px");
    body.src = "https://mc-heads.net/player/" + encodeURIComponent(entry.headId) + "/72";
    body.alt = "";
    body.width = 72;
    body.height = 144;
    body.loading = "lazy";
    body.decoding = "async";
    return body;
  }

  function podiumPlace(entry, rank) {
    var place = el("div", "podium-place podium-" + rank);
    var visual = podiumVisual(entry);
    visual.classList.add("podium-visual");
    place.append(visual, el("p", "podium-name", entry.name), el("p", "podium-value", entry.value), el("div", rank === 1 ? "blk-gold podium-block" : "panel podium-block", rank));
    return place;
  }

  function setBoardState(container, kind, message, retry) {
    var state = $("[data-board-state]", container);
    if (!state) return;
    state.replaceChildren();
    state.hidden = kind === "ready";
    container.setAttribute("data-board-status", kind);
    if (kind === "ready") return;
    state.append(el("p", "", message));
    if (retry) {
      var button = el("button", "btn btn-dark", "Try again");
      button.type = "button";
      button.addEventListener("click", retry);
      state.append(button);
    }
  }

  function loadBoard(container) {
    var id = container.getAttribute("data-board");
    var boards = (cfg.leaderboards && Array.isArray(cfg.leaderboards.active)) ? cfg.leaderboards.active : [];
    var board = boards.filter(function (candidate) { return candidate.id === id; })[0];
    var rows = $("[data-board-rows]", container);
    var podium = $("[data-board-podium]", container);
    var limit = Number(container.getAttribute("data-limit")) || (board && board.limit) || 10;
    var endpoint = board ? boardEndpoint(board) : "";
    var retry = function () { loadBoard(container); };

    if (!board || !endpoint || !rows) {
      setBoardState(container, "error", "This leaderboard is not set up yet.");
      return;
    }
    setBoardState(container, "loading", "Loading the leaderboard...");

    fetch(endpoint, { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("leaderboard unavailable");
        return response.json();
      })
      .then(function (payload) {
        var entries = normalizeEntries(payload, board).slice(0, limit);
        if (!entries.length) {
          setBoardState(container, "empty", "No one is on this leaderboard yet.", retry);
          return;
        }
        var usePodium = podium && container.getAttribute("data-layout") === "podium" && entries.length >= 3;
        rows.replaceChildren();
        if (podium) podium.replaceChildren();
        if (usePodium) {
          // Second, first, third: the winner stands in the middle.
          [1, 0, 2].forEach(function (index) { podium.append(podiumPlace(entries[index], index + 1)); });
        }
        entries.forEach(function (entry, index) {
          if (usePodium && index < 3) return;
          rows.append(boardRow(entry, index + 1, !usePodium && index === 0));
        });
        if (podium) podium.hidden = !usePodium;
        rows.hidden = rows.childElementCount === 0;
        setBoardState(container, "ready");
      })
      .catch(function () {
        setBoardState(container, "error", "Leaderboard data is unavailable right now.", retry);
      });
  }

  function initBoards() {
    $$("[data-board]").forEach(loadBoard);
  }

  /* ------------------------------------------------------------------ video of the week
   * One video from the community playlist takes the spot each week, changing on Monday.
   * The list lives in assets/video-rotation.js. Nothing loads from YouTube until Play is pressed,
   * apart from the preview picture.
   */
  function initVideoOfTheWeek() {
    var rotation = window.ENTHUSIA_VIDEOS;
    var frame = $('[data-vid="frame"]');
    if (!frame || !rotation || !Array.isArray(rotation.videos) || !rotation.videos.length) return;

    var videos = rotation.videos;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var start = rotation.weekZero || [2026, 8, 28];
    var offset = 0;

    function weekStart(week) { return new Date(start[0], start[1], start[2] + week * 7); }
    function dayLabel(date) { return date.getDate() + " " + months[date.getMonth()]; }
    function pick(week) { return ((week % videos.length) + videos.length) % videos.length; }
    function set(name, value) { $$('[data-vid="' + name + '"]').forEach(function (node) { node.textContent = value; }); }
    function nowWeek() { return Math.floor((Date.now() - weekStart(0).getTime()) / 604800000); }

    function stop() {
      var player = $("iframe", frame);
      if (player) player.remove();
      frame.classList.remove("is-playing");
    }

    function render() {
      stop();
      var week = nowWeek() + offset;
      var index = pick(week);
      var video = videos[index];
      var end = new Date(start[0], start[1], start[2] + week * 7 + 6);
      var poster = $('[data-vid="poster"]', frame);
      if (poster) {
        poster.onerror = function () {
          poster.onerror = null;
          poster.src = "https://i.ytimg.com/vi/" + encodeURIComponent(video.id) + "/hqdefault.jpg";
        };
        poster.src = "https://i.ytimg.com/vi/" + encodeURIComponent(video.id) + "/maxresdefault.jpg";
      }
      set("kicker", offset === 0 ? "VIDEO OF THE WEEK" : offset < 0 ? "AN EARLIER WEEK" : "A COMING WEEK");
      set("title", video.title);
      set("by", video.by);
      set("length", video.length);
      set("week", "Week of " + dayLabel(weekStart(week)) + " to " + dayLabel(end) + " " + end.getFullYear());
      set("position", "Video " + (index + 1) + " of " + videos.length + " in the rotation.");
      $$('[data-vid="link"]').forEach(function (link) {
        link.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(video.id) + (rotation.playlistId ? "&list=" + encodeURIComponent(rotation.playlistId) : "");
      });
      $$('[data-vid-action="now"]').forEach(function (button) { button.setAttribute("aria-pressed", offset === 0 ? "true" : "false"); });
      for (var i = 0; i < 3; i += 1) {
        var next = videos[pick(week + 1 + i)];
        set("next" + i + "-date", "From " + dayLabel(weekStart(week + 1 + i)));
        set("next" + i + "-title", next.title);
        set("next" + i + "-by", next.by);
      }
      frame.setAttribute("data-video-id", video.id);
    }

    function play() {
      var id = frame.getAttribute("data-video-id");
      if (!id || $("iframe", frame)) return;
      var player = el("iframe", "vid-player");
      player.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
      player.title = "YouTube video player";
      player.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      player.setAttribute("allowfullscreen", "");
      player.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      frame.append(player);
      frame.classList.add("is-playing");
    }

    doc.addEventListener("click", function (event) {
      var button = event.target.closest("[data-vid-action]");
      if (!button) return;
      var action = button.getAttribute("data-vid-action");
      if (action === "play") { play(); return; }
      if (action === "stop") { stop(); return; }
      if (action === "prev") offset -= 1;
      if (action === "next") offset += 1;
      if (action === "now") offset = 0;
      render();
    });

    render();
  }

  /* ------------------------------------------------------------------ vote listings opened this visit */
  function initVoteTracker() {
    var rows = $$("[data-vote]");
    if (!rows.length) return;
    var counter = $("[data-vote-count]");
    var segments = $$("[data-vote-seg]");
    function update() {
      var done = rows.filter(function (row) { return row.classList.contains("done"); }).length;
      if (counter) counter.textContent = done + " / " + rows.length;
      segments.forEach(function (segment, index) { segment.classList.toggle("done", rows[index] && rows[index].classList.contains("done")); });
    }
    rows.forEach(function (row) {
      var link = $("a", row);
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
    var script = doc.currentScript || $('script[src*="assets/enthusia.js"]');
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
    initBoards();
    initVideoOfTheWeek();
    initVoteTracker();
    initSkin();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
})();
