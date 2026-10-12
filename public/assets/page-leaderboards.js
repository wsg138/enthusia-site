/* Public leaderboard rendering; native DOM and text APIs only. */
(function () {
  "use strict";
  var doc = document;
  var cfg = window.ENTHUSIA || {};
  function selectOne(selector, scope) { return (scope || doc).querySelector(selector); }
  function selectAll(selector, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(selector)); }
  function text(value) { return typeof value === "string" ? value.trim() : ""; }
  function el(tag, className, content) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }
  function formatNumber(value) { return new Intl.NumberFormat("en-US").format(value); }
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

  function guildValue(level, experience, score) {
    if (level !== null) return "Level " + formatNumber(level);
    if (experience !== null) return formatNumber(experience) + " XP";
    return score !== null ? formatNumber(score) : "";
  }

  function guildMemberUuids(entry) {
    return entry.topMemberUuids || entry.top_member_uuids || entry.memberUuids || entry.member_uuids;
  }

  function normalizeGuild(entry, index) {
    var level = pickNumber(entry.level, entry.currentLevel, entry.current_level);
    var experience = pickNumber(entry.totalExperience, entry.total_xp, entry.totalExperiencePoints, entry.total_experience);
    var members = pickNumber(entry.memberCount, entry.members, entry.member_count, entry.activeMembers, entry.active_members);
    var score = pickNumber(entry.value, entry.score);
    var name = pickText(entry.name, entry.guildName, entry.guild_name, entry.displayName, entry.display_name, entry.tagPlain, entry.tag, entry.entityName, entry.entity_name);
    var uuids = guildMemberUuids(entry);
    return {
      name: name,
      detail: members !== null ? formatNumber(members) + " members" : "",
      value: guildValue(level, experience, score),
      banner: entry.banner && typeof entry.banner === "object" ? entry.banner : null,
      isGuild: true,
      headId: Array.isArray(uuids) ? text(uuids[0]) : "",
      rank: pickNumber(entry.rank) || index + 1
    };
  }

  function normalizePlayer(entry, index) {
    var username = pickText(entry.username, entry.player, entry.uuid);
    var uuid = pickText(entry.uuid, entry.playerUuid, entry.player_uuid);
    var skinId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(uuid) ? uuid.toLowerCase() : username;
    return {
      name: pickText(entry.displayName, entry.username, entry.name),
      detail: pickText(entry.subtext, entry.subtitle, entry.description),
      value: pickText(entry.formattedValue, entry.formatted, entry.stat, entry.score, entry.amount, entry.hours, entry.balance, entry.experience, entry.level),
      banner: null,
      headId: skinId || pickText(entry.displayName, entry.name),
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
    if (entry.isGuild || !entry.headId) return window.EnthusiaGuildBannerRenderer.createPlaceholder(entry.name);
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
    var state = selectOne("[data-board-state]", container);
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

  function configuredBoards() {
    if (!cfg.leaderboards) return [];
    if (!Array.isArray(cfg.leaderboards.active)) return [];
    return cfg.leaderboards.active;
  }
  function boardLimit(container, board) {
    return Number(container.getAttribute("data-limit")) || (board && board.limit) || 10;
  }
  function loadBoard(container) {
    var id = container.getAttribute("data-board");
    var boards = configuredBoards();
    var board = boards.filter(function (candidate) { return candidate.id === id; })[0];
    var rows = selectOne("[data-board-rows]", container);
    var podium = selectOne("[data-board-podium]", container);
    var limit = boardLimit(container, board);
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
    selectAll("[data-board]").forEach(loadBoard);
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", initBoards); else initBoards();
})();
