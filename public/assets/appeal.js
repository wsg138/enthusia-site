/*
 * Punishment appeal form.
 *
 * Same requests as before: GET /api/appeals/eligible lists the punishments this signed-in account
 * may appeal, POST /api/appeals submits one. The player identity always comes from the session.
 * This lives in its own file because the site only allows scripts from its own origin.
 */
(function () {
  "use strict";

  var form = document.querySelector("#appeal-form");
  var result = document.querySelector("#result");
  var select = document.querySelector("#punishment");
  var sanction = document.querySelector("#sanction");
  if (!form || !result || !select || !sanction) return;

  var sanctions = [];

  function setOptions(label) {
    select.replaceChildren(new Option(label, ""));
  }

  function render() {
    var item = sanctions.filter(function (candidate) { return String(candidate.id) === select.value; })[0];
    sanction.textContent = item
      ? (item.type || "Punishment") + " · issued " + (item.createdAt || "unknown date") + " · " + (item.reason || "No public reason provided")
      : "";
    sanction.hidden = !item;
  }

  function loadError() {
    sanctions = [];
    setOptions("Unable to load punishments - retry later");
    render();
  }

  function load() {
    setOptions("Loading appealable punishments...");
    return fetch("/api/appeals/eligible")
      .then(function (response) {
        if (!response.ok) { loadError(); return null; }
        return response.json();
      })
      .then(function (payload) {
        if (!payload) return;
        sanctions = Array.isArray(payload) ? payload : payload.punishments || [];
        setOptions(sanctions.length ? "Select a punishment" : "No appealable punishments");
        sanctions.forEach(function (item) {
          select.add(new Option((item.type || "Punishment") + " - " + (item.createdAt || item.id), item.id));
        });
        render();
      })
      .catch(loadError);
  }

  select.addEventListener("change", render);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    result.textContent = "Submitting...";
    var data = Object.fromEntries(new FormData(form));
    fetch("/api/appeals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          if (response.ok) {
            result.textContent = "Appeal submitted.";
            form.reset();
            return load();
          }
          result.textContent = payload.error === "rate_limited"
            ? "Too many attempts. Try again in " + payload.retryAfter + " seconds."
            : "Unable to submit appeal (" + response.status + ").";
          return null;
        });
      })
      .catch(function () { result.textContent = "Unable to reach the appeal service. Retry in a moment."; });
  });

  load();
})();
