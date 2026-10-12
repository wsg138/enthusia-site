/*
 * Preview build only - not part of the site.
 * Answers the Market page's own requests (snapshot + live socket) from the bundled sample data, so the real
 * market scripts run unchanged. The sample is reshaped to the live API format, its dates are moved to "now",
 * a few well-known players are given stalls, and a set of everyday priced shops is added so the price features
 * have something to show.
 */
(function () {
  "use strict";
  var API = "https://market-api.enthusia.info";
  var prevFetch = window.fetch.bind(window);

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var NAMES = ["Kostpits13_", "Kavebo", "CheddarManPro", "SleepingOnCheese", "GodOfSharks", "ItzOkPookie", "BaLIneA", "DarkHabits", "Summars", "FainNeito", "StepSoy", "LavKun"];
  // [material, display name, typical price in gold ingots]
  var GOODS = [["DIAMOND", "Diamond", 13.6], ["EMERALD", "Emerald", 2.4], ["OBSIDIAN", "Obsidian", 1.8], ["ANCIENT_DEBRIS", "Ancient Debris", 58], ["SHULKER_SHELL", "Shulker Shell", 36.5], ["TOTEM_OF_UNDYING", "Totem of Undying", 92], ["NETHER_STAR", "Nether Star", 520], ["TRIDENT", "Trident", 310], ["NETHERITE_INGOT", "Netherite Ingot", 410], ["BEACON", "Beacon", 780], ["HEART_OF_THE_SEA", "Heart of the Sea", 270], ["ELYTRA", "Elytra", 1250]];
  var BANNERS = [["RED", "YELLOW"], ["BLUE", "WHITE"], ["BLACK", "ORANGE"], ["GREEN", "LIME"]];
  var head = function (name) { return "https://minotar.net/helm/" + encodeURIComponent(name) + "/96.png"; };

  function transform(src) {
    var shift = Date.now() - Date.parse(src.generatedAt);
    var moved = function (v) { return typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(Date.parse(v) + shift).toISOString() : v; };
    var r = rng(42), nextShop = 5000, guildIndex = 0;
    var stalls = JSON.parse(JSON.stringify(src.stalls));
    stalls.forEach(function (stall) {
      ["nextRentAt", "graceEndsAt", "ownerSince"].forEach(function (k) { if (stall[k]) stall[k] = moved(stall[k]); });
      var o = stall.owner;
      if (o.type === "PLAYER") { o.avatarUrl = head(o.name); o.avatar = { kind: "MINECRAFT_HEAD", source: "JAVA", includesOuterLayer: true }; }
      else if (o.type === "GUILD") { var b = BANNERS[guildIndex++ % BANNERS.length]; o.avatarUrl = null; o.avatar = { kind: "GUILD_BANNER", banner: { baseColor: b[0], patterns: [{ type: "STRIPE_CENTER", color: b[1] }] } }; }
    });
    // Everyday priced shops on player stalls with room, and well-known names on the first nine of them.
    var rooms = stalls.filter(function (s) { return s.owner.type === "PLAYER" && s.shops.length <= 2; }).slice(0, 26);
    rooms.forEach(function (stall, i) {
      var count = 1 + (i % 2);
      for (var k = 0; k < count; k++) {
        var g = GOODS[(i * 3 + k * 5) % GOODS.length], unit = g[2] * (0.8 + r() * 0.44);
        var amount = unit < 5 ? 16 : unit < 100 ? 4 : 1, cost = Math.max(1, Math.round(unit * amount));
        stall.shops.push({
          id: nextShop++, owner: { id: stall.owner.id, name: stall.owner.name }, direction: "SELL",
          sellItem: { material: g[0], displayName: g[1], amount: amount, icon: null, metadata: {} },
          costItem: { material: "GOLD_INGOT", displayName: "Gold Ingot", amount: 1, icon: null, metadata: {} },
          interaction: { world: "world", x: stall.location.x, y: stall.location.y, z: stall.location.z, source: "SHOP_INTERACTION" },
          stockCount: r() < 0.18 ? 0 : 8 + Math.floor(r() * 56), availableTrades: 6, searchable: true, sellAmount: amount, costAmount: cost
        });
      }
      if (i < NAMES.length) {
        stall.owner.name = NAMES[i]; stall.owner.avatarUrl = head(NAMES[i]);
        stall.shops.forEach(function (shop) { shop.owner.name = NAMES[i]; });
      }
    });
    return { schemaVersion: 1, serverId: "enthusia-main", sequence: 1, snapshotRevision: 1, updatedAt: new Date().toISOString(), stalls: stalls };
  }

  var snapshot = null, sequence = 1;
  function load() {
    if (!snapshot) snapshot = prevFetch("assets/market/sample-market-snapshot.json").then(function (r) { return r.json(); }).then(transform);
    return snapshot;
  }
  function jsonResponse(body) { return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }); }

  window.fetch = function (input, init) {
    var url = String((input && input.url) || input);
    if (url.indexOf(API + "/v1/market") === 0) return load().then(function (s) { return jsonResponse(Object.assign({}, s, { sequence: sequence })); });
    return prevFetch(input, init);
  };

  // A quiet stand-in for the live socket: says hello, then now and then changes one shop's stock.
  var RealSocket = window.WebSocket;
  function FakeSocket(url) {
    var self = this, target = document.createDocumentFragment();
    this.readyState = 0; this.url = url;
    this.addEventListener = target.addEventListener.bind(target);
    this.removeEventListener = target.removeEventListener.bind(target);
    var emit = function (type, data) { var e = new Event(type); if (data !== undefined) e.data = data; target.dispatchEvent(e); };
    var timer = null, rand = rng(7);
    setTimeout(function () {
      self.readyState = 1; emit("open"); emit("message", JSON.stringify({ type: "hello", sequence: sequence }));
      timer = setInterval(function () {
        load().then(function (s) {
          var withShops = s.stalls.filter(function (x) { return x.shops.length; });
          var stall = JSON.parse(JSON.stringify(withShops[Math.floor(rand() * withShops.length)]));
          stall.shops[0].stockCount = Math.floor(rand() * 60);
          sequence += 1;
          emit("message", JSON.stringify({ type: "stall.updated", sequence: sequence, stallId: stall.id, stall: stall, updatedAt: new Date().toISOString() }));
        });
      }, 20000);
    }, 60);
    this.send = function () {};
    this.close = function () { clearInterval(timer); if (self.readyState !== 3) { self.readyState = 3; emit("close"); } };
  }
  window.WebSocket = function (url, protocols) {
    return String(url).indexOf("market-api.enthusia.info") !== -1 ? new FakeSocket(url) : new RealSocket(url, protocols);
  };
})();
