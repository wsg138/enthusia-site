(function () {
  "use strict";
  var listEl = document.getElementById("moderation-list");
  var moreBtn = document.getElementById("moderation-more");
  var statusEl = document.getElementById("moderation-status");
  var typeSelect = document.getElementById("moderation-type");
  var searchForm = document.getElementById("moderation-search-form");
  var searchInput = document.getElementById("moderation-q");
  var clearBtn = document.getElementById("moderation-clear");
  var caseSection = document.getElementById("moderation-case");
  var caseTitle = document.getElementById("moderation-case-title");
  var caseFields = document.getElementById("moderation-case-fields");
  var caseClose = document.getElementById("moderation-case-close");

  var cursor = null;
  var loading = false;
  var inSearchMode = false;

  function setStatus(message) {
    statusEl.textContent = message || "";
  }

  function formatDate(iso) {
    if (iso === null || iso === undefined || iso === "") return "—";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return String(iso);
    return date.toLocaleString();
  }

  function textOf(value) {
    return value === null || value === undefined || value === "" ? "—" : String(value);
  }

  function addMetaRow(dl, label, value) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = textOf(value);
    dl.append(dt, dd);
  }

  function caseLink(caseId) {
    var link = document.createElement("a");
    link.href = "#moderation-case";
    link.textContent = "Case " + caseId;
    link.addEventListener("click", function (event) {
      event.preventDefault();
      showCase(caseId);
    });
    return link;
  }

  function punishmentCard(item) {
    var card = document.createElement("article");
    card.className = "card";

    var head = document.createElement("div");
    head.className = "mod-card-head";
    var player = document.createElement("strong");
    player.textContent = textOf(item.player);
    var type = document.createElement("span");
    type.className = "mod-type";
    type.textContent = textOf(item.punishmentType);
    head.append(player, type);

    var reason = document.createElement("p");
    reason.textContent = textOf(item.publicReason || item.broadReason);

    var meta = document.createElement("dl");
    meta.className = "mod-meta";
    addMetaRow(meta, "Issued", formatDate(item.issuedAt));
    addMetaRow(meta, "State", item.state);
    if (item.expiresAt) addMetaRow(meta, "Expires", formatDate(item.expiresAt));
    if (item.remainingSeconds !== null && item.remainingSeconds !== undefined) {
      addMetaRow(meta, "Remaining", textOf(item.remainingSeconds) + "s");
    }

    var foot = document.createElement("div");
    foot.className = "mod-card-foot";
    if (item.caseId) foot.append(caseLink(item.caseId));
    if (item.appealAvailable) {
      var appeal = document.createElement("a");
      appeal.href = "appeal.html";
      appeal.textContent = "Appealable — see appeal.html";
      foot.append(appeal);
    }

    card.append(head, reason, meta);
    if (foot.childNodes.length > 0) card.append(foot);
    return card;
  }

  function renderCaseDetail(caseId, detail) {
    caseTitle.textContent = "Case " + caseId;
    caseFields.replaceChildren();
    if (!detail || typeof detail !== "object") {
      addMetaRow(caseFields, "Detail", "No detail available.");
    } else {
      // Known fields first, in a stable order; everything else rendered
      // defensively below so unknown fields never break the page.
      var shown = {};
      ["player", "punishmentType", "broadReason", "publicReason"].forEach(function (key) {
        if (detail[key] !== undefined) { addMetaRow(caseFields, key, detail[key]); shown[key] = true; }
      });
      ["issuedAt", "expiresAt"].forEach(function (key) {
        if (detail[key] !== undefined) { addMetaRow(caseFields, key, formatDate(detail[key])); shown[key] = true; }
      });
      ["state", "caseId", "appealAvailable"].forEach(function (key) {
        if (detail[key] !== undefined) { addMetaRow(caseFields, key, detail[key]); shown[key] = true; }
      });
      Object.keys(detail).forEach(function (key) {
        if (shown[key]) return;
        var value = detail[key];
        addMetaRow(caseFields, key, (value !== null && typeof value === "object") ? JSON.stringify(value) : value);
      });
      if (detail.appealAvailable) {
        var link = document.createElement("a");
        link.href = "appeal.html";
        link.textContent = "Appealable — see appeal.html";
        addMetaRow(caseFields, "Appeal", "");
        caseFields.lastChild.replaceChildren(link);
      }
    }
    caseSection.hidden = false;
    caseSection.scrollIntoView({ block: "start" });
  }

  function hideCase() {
    caseSection.hidden = true;
    caseFields.replaceChildren();
  }

  async function fetchJson(url) {
    var response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) {
      var error = new Error("request failed: " + response.status);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function loadRecent(reset) {
    if (loading) return;
    loading = true;
    if (reset) {
      cursor = null;
      listEl.replaceChildren();
      moreBtn.hidden = true;
    }
    setStatus("Loading…");
    try {
      var params = new URLSearchParams({ limit: "30" });
      var type = typeSelect.value;
      if (type) params.set("type", type);
      if (cursor) params.set("cursor", cursor);
      var payload = await fetchJson("/api/moderation/punishments?" + params.toString());
      var items = Array.isArray(payload.items) ? payload.items : [];
      items.forEach(function (item) { listEl.append(punishmentCard(item)); });
      cursor = payload.nextCursor || null;
      moreBtn.hidden = !cursor;
      setStatus(items.length === 0 && reset ? "No punishments found." : "");
    } catch (error) {
      setStatus("Unable to load punishments right now. Please try again later.");
    } finally {
      loading = false;
    }
  }

  async function runSearch() {
    var q = searchInput.value.trim();
    if (!q) {
      setStatus("Enter a username or case ID to search.");
      return;
    }
    hideCase();
    setStatus("Searching…");
    try {
      var payload = await fetchJson("/api/moderation/search?q=" + encodeURIComponent(q));
      var items = Array.isArray(payload.items) ? payload.items : [];
      listEl.replaceChildren();
      items.forEach(function (item) { listEl.append(punishmentCard(item)); });
      inSearchMode = true;
      clearBtn.hidden = false;
      moreBtn.hidden = true;
      setStatus(items.length === 0 ? "No matches found." : "");
    } catch (error) {
      setStatus(error.status === 400
        ? "Search text must be 1–64 characters."
        : "Search is unavailable right now. Please try again later.");
    }
  }

  function exitSearchMode() {
    inSearchMode = false;
    clearBtn.hidden = true;
    searchInput.value = "";
    loadRecent(true);
  }

  async function showCase(caseId) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(caseId)) {
      setStatus("That case ID is not valid.");
      return;
    }
    setStatus("Loading case…");
    try {
      var detail = await fetchJson("/api/moderation/cases/" + encodeURIComponent(caseId));
      setStatus("");
      renderCaseDetail(caseId, detail);
    } catch (error) {
      setStatus(error.status === 404
        ? "Case not found."
        : "Unable to load the case right now. Please try again later.");
    }
  }

  searchForm.addEventListener("submit", function (event) {
    event.preventDefault();
    runSearch();
  });
  clearBtn.addEventListener("click", exitSearchMode);
  typeSelect.addEventListener("change", function () {
    if (inSearchMode) exitSearchMode();
    else loadRecent(true);
  });
  moreBtn.addEventListener("click", function () { loadRecent(false); });
  caseClose.addEventListener("click", hideCase);

  loadRecent(true);
})();
