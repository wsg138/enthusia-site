/*
 * Preview build only - not part of the site.
 * The preview frame blocks every outside request, so this file answers the site's requests from files
 * bundled with the preview: leaderboards, server status, Discord count, player heads, skins and video pictures.
 * The site's own scripts run unchanged.
 */
(function () {
  "use strict";
  var HEADS = {"fainneito": "FainNeito.png", "stepsoy": "StepSoy.png", "lavkun": "LavKun.png", "godofsharks": "GodOfSharks.png", "kostpits13_": "Kostpits13_.png", "sleepingoncheese": "SleepingOnCheese.png", "itzokpookie": "ItzOkPookie.png", "cheddarmanpro": "CheddarManPro.png", "balinea": "BaLIneA.png", "kavebo": "Kavebo.png", "gussybacka": "GussyBacka.png", "darkhabits": "DarkHabits.png", "snickered": "snickered.png", "john_raidfarms": "John_Raidfarms.png", "timbob82": "Timbob82.png", "mrketaminezz": "MrKetaminezz.png", "summars": "Summars.png", "toxikflame11": "ToxikFlame11.png", "pbe": "Pbe.png", "qaysoz": "qaysoz.png"};
  var BODIES = {"fainneito": "FainNeito.png", "p2wn": "P2wn.png", "sharpmatt": "Sharpmatt.png", "1aa50ca2-a806-4d5c-ae8e-a553fd1a8b7d": "1aa50ca2-a806-4d5c-ae8e-a553fd1a8b7d.png", "borlyn": "Borlyn.png", "toxikflame11": "ToxikFlame11.png", "badgersmc": "BadgersMC.png", "demimeow": "demimeow.png", "orbitzx": "OrbitzX.png", "boggersthefish": "BoggersTheFish.png", "sirbobertt": "sirbobertt.png", "rafffff3282": "rafffff3282.png", "realreloadcoded": "RealReloadCoded.png", "7ccc3217-21bb-4e61-a055-e756e29e2cc3": "7ccc3217-21bb-4e61-a055-e756e29e2cc3.png", "sonofblood": "SonOfBlood.png", "kostpits13_": "Kostpits13_.png", "toxik": "Toxik.png", "theend3rdrag0n": "TheEnd3rDrag0n.png", "averality": "averality.png", "shoo": "Shoo.png", "lavkun": "LavKun.png", "stepsoy": "StepSoy.png"};
  var realFetch = window.fetch.bind(window);

  function json(file) { return realFetch("preview/data/" + file + ".json"); }
  window.fetch = function (input, init) {
    var url = String((input && input.url) || input);
    var board = url.match(/\/api\/leaderboards\/([\w-]+)/);
    if (board) return json(board[1]);
    if (url.indexOf("api.mcstatus.io") !== -1) return json("status");
    if (url.indexOf("discord.com/api") !== -1) return json("discord");
    if (url.indexOf("/api/") === 0) {
      return Promise.resolve(new Response('{"error":"signed_out"}', { status: 401, headers: { "content-type": "application/json" } }));
    }
    return realFetch(input, init);
  };

  function local(url) {
    var match = String(url).match(/^https:\/\/minotar\.net\/helm\/([^/]+)\//);
    if (match) return "preview/heads/" + (HEADS[decodeURIComponent(match[1]).toLowerCase()] || "_default.png");
    match = String(url).match(/^https:\/\/mc-heads\.net\/player\/([^/]+)\//);
    if (match) return "preview/skins/" + (BODIES[decodeURIComponent(match[1]).toLowerCase()] || "FainNeito.png");
    match = String(url).match(/^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\//);
    if (match) return "preview/posters/" + decodeURIComponent(match[1]) + ".jpg";
    return url;
  }
  var source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    configurable: true,
    enumerable: source.enumerable,
    get: function () { return source.get.call(this); },
    set: function (value) { source.set.call(this, local(value)); }
  });

  // The seasonal skin is normally switched on with ?skin=sculk; the preview frame drops the query string,
  // so the bar below sets it through the address hash instead.
  if (window.location.hash === "#sculk") document.documentElement.setAttribute("data-skin", "sculk");

  document.addEventListener("click", function (event) {
    var play = event.target.closest && event.target.closest('[data-vid-action="play"]');
    if (!play) return;
    event.stopImmediatePropagation();
    var note = document.querySelector("[data-preview-note]");
    if (note) note.textContent = "The video player is switched off in this preview. Use Watch on YouTube.";
  }, true);

  document.addEventListener("DOMContentLoaded", function () {
    var bar = document.createElement("div");
    bar.className = "preview-bar";
    var note = document.createElement("p");
    note.setAttribute("data-preview-note", "");
    note.textContent = document.body.hasAttribute("data-mockup")
      ? "Design mockup with sample content. This page is not built on the branch yet."
      : "Built page from the branch. Server status, Discord count and leaderboards show sample numbers."
        + (document.getElementById("warzone") ? " The Warzone tile is still a mockup." : "");
    bar.append(note);
    if (document.querySelector(".hero-vars[data-slide-auto]")) {
      var on = window.location.hash === "#sculk";
      var toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = "preview-skin-toggle";
      toggle.className = "chip";
      toggle.textContent = on ? "Turn the sculk skin off" : "Show the sculk skin";
      toggle.addEventListener("click", function () {
        window.location.hash = on ? "" : "sculk";
        window.location.reload();
      });
      bar.append(toggle);
    }
    var host = document.querySelector(".en") || document.body;
    host.prepend(bar);
  });
})();
