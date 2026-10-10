/* Events & Competitions page enhancement.
 *
 * Reads the R2-backed boards served by /api/events/* and renders the live
 * schedule + champions panels when the data is available. Everything is
 * strictly graceful: if any request fails or the payload is unexpected, the
 * static page content stays exactly as authored - no blank sections, no
 * stack traces. All dynamic text goes through textContent only.
 */
(function () {
  "use strict";

  var SCHEDULE_URL = "/api/events/schedule";
  var STATS_URL = "/api/events/stats";
  var MAX_WINS_ROWS = 10;
  var MAX_RECENT_ROWS = 8;

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    return node;
  }

  function setText(node, text) {
    node.textContent = String(text === null || text === undefined ? "" : text);
  }

  function fetchBoard(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    }).then(function (data) {
      if (!data || data.ok !== true) {
        throw new Error("bad payload");
      }
      return data;
    });
  }

  function formatDateTime(iso) {
    if (typeof iso !== "string" || !iso) {
      return null;
    }
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function isRecord(value) {
    return value !== null && typeof value === "object";
  }

  // --- Schedule -----------------------------------------------------------

  function addUpcomingLine(container, label, iso) {
    var formatted = formatDateTime(iso);
    if (!formatted) {
      return;
    }
    var p = el("p");
    var strong = el("strong");
    setText(strong, label + ": ");
    p.appendChild(strong);
    var span = el("span");
    setText(span, formatted);
    p.appendChild(span);
    container.appendChild(p);
  }

  function renderSchedule(doc) {
    var mount = document.getElementById("eventsLiveSchedule");
    if (!mount || !isRecord(doc.physicalEvents) || !isRecord(doc.chatEvents)) {
      return;
    }

    var lines = el("div", "events-upcoming");
    var physical = doc.physicalEvents;
    var chat = doc.chatEvents;

    var hasPhysical = physical.nextVoteAt || physical.nextEventAt;
    var hasChat = chat.nextChatEventAt;
    if (!hasPhysical && !hasChat) {
      return;
    }

    if (physical.nextVoteAt) {
      addUpcomingLine(lines, "Next vote opens", physical.nextVoteAt);
    }
    if (physical.nextEventAt) {
      addUpcomingLine(lines, "Next physical event", physical.nextEventAt);
    }
    if (chat.nextChatEventAt) {
      addUpcomingLine(lines, "Next chat event", chat.nextChatEventAt);
    }

    var card = el("article", "card feature-card");
    var kicker = el("span", "card-kicker");
    setText(kicker, "Live schedule");
    var heading = el("h3");
    setText(heading, "Upcoming events");
    card.appendChild(kicker);
    card.appendChild(heading);
    card.appendChild(lines);
    mount.appendChild(card);
  }

  // --- Champions ----------------------------------------------------------

  function renderWinners(container, topWins) {
    var card = el("article", "card feature-card");
    var kicker = el("span", "card-kicker");
    setText(kicker, "Most wins");
    var heading = el("h3");
    setText(heading, "Top winners");
    card.appendChild(kicker);
    card.appendChild(heading);

    var list = el("ol", "events-winners");
    topWins.slice(0, MAX_WINS_ROWS).forEach(function (row, index) {
      if (!isRecord(row) || typeof row.name !== "string" || typeof row.wins !== "number") {
        return;
      }
      var item = el("li");
      var rank = el("span", "events-rank");
      setText(rank, String(index + 1) + ".");
      item.appendChild(rank);
      var name = el("strong");
      setText(name, row.name);
      item.appendChild(name);
      var detail = el("span", "events-meta");
      var played = typeof row.eventsPlayed === "number" ? " · " + String(row.eventsPlayed) + " played" : "";
      setText(detail, String(row.wins) + " wins" + played);
      item.appendChild(detail);
      list.appendChild(item);
    });
    card.appendChild(list);
    container.appendChild(card);
  }

  function renderRecent(container, recentEvents) {
    var card = el("article", "card feature-card");
    var kicker = el("span", "card-kicker");
    setText(kicker, "Latest results");
    var heading = el("h3");
    setText(heading, "Recent events");
    card.appendChild(kicker);
    card.appendChild(heading);

    var list = el("ul", "events-recent");
    recentEvents.slice(0, MAX_RECENT_ROWS).forEach(function (row) {
      if (!isRecord(row) || typeof row.eventType !== "string" || typeof row.winner !== "string") {
        return;
      }
      var item = el("li");
      var main = el("strong");
      setText(main, row.eventType + " — won by " + row.winner);
      item.appendChild(main);
      var when = formatDateTime(row.date);
      if (when) {
        var meta = el("span", "events-meta");
        setText(meta, when);
        item.appendChild(meta);
      }
      list.appendChild(item);
    });
    card.appendChild(list);
    container.appendChild(card);
  }

  function renderChampions(doc) {
    var mount = document.getElementById("eventsChampions");
    if (!mount || !Array.isArray(doc.topWins) || !Array.isArray(doc.recentEvents)) {
      return;
    }
    if (doc.topWins.length === 0 && doc.recentEvents.length === 0) {
      return;
    }
    while (mount.firstChild) {
      mount.removeChild(mount.firstChild);
    }
    var grid = el("div", "events-champs-grid");
    if (doc.topWins.length > 0) {
      renderWinners(grid, doc.topWins);
    }
    if (doc.recentEvents.length > 0) {
      renderRecent(grid, doc.recentEvents);
    }
    mount.appendChild(grid);
  }

  // --- Boot ----------------------------------------------------------------

  function boot() {
    fetchBoard(SCHEDULE_URL).then(renderSchedule).catch(function () {
      /* keep the static schedule - nothing to do */
    });
    fetchBoard(STATS_URL).then(renderChampions).catch(function () {
      /* keep the "coming soon" placeholder - nothing to do */
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
