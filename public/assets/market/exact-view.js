/* Market insights (Stall of the Week + Price Tracker). Stand-in data; the real page loads the same shapes from the market API.
   Builds everything with createElement/textContent, so it needs no inline script or innerHTML. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "class") el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }
  function s(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function $(id) { return document.getElementById(id); }

  function gold(n) {
    if (n >= 100) return Math.round(n).toLocaleString("en-US");
    if (n >= 10) return n.toFixed(1);
    return n.toFixed(2);
  }
  function pct(p) {
    if(p===null||p===undefined)return "Unavailable";
    var v = Math.round(p * 10) / 10;
    return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  function dir(p) { return p > 0.05 ? "up" : p < -0.05 ? "down" : "flat"; }
  function day(d) { return MONTHS[d.getMonth()] + " " + d.getDate(); }
  function head(name, size, cls) {
    var img = h("img", { class: "px " + (cls || ""), width: size, height: size, alt: "" });
    img.src = "https://minotar.net/helm/" + encodeURIComponent(name) + "/" + size;
    return img;
  }

  /* ---------- stand-in data ---------- */

  var model=window.EnthusiaMarketDesignModel;
  var winners=model.winners, live=model.live, items=model.items;
  /* ---------- week helpers ---------- */

  function weekStart(offsetWeeks) {
    if(!model.preview){return new Date(Date.parse(model.currentWeek)+offsetWeeks*7*86400000);}
    var d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
    return d;
  }
  function range(offsetWeeks) {
    var a = weekStart(offsetWeeks), b = new Date(a); b.setDate(b.getDate() + 6);
    return day(a) + " - " + day(b);
  }
  function daysLeft() {
    var n = new Date(), end = weekStart(1);
    return Math.max(0, Math.ceil((end - n) / 86400000));
  }

  /* ---------- map link ---------- */

  // Names -> the real stall ids, filled in once the market snapshot has loaded.
  var ownerStall = {}, guildStall = {};
  function sid(name) { return ownerStall[name] || guildStall[name] || (model.stallTotals?.[name]!==undefined?name:""); }
  function sl(name) { var m = sid(name).match(/\d+/); return m ? "Stall " + m[0] : "Stall"; }
  function showOnMap(id) { if (id && window.EnthusiaMarketMap) window.EnthusiaMarketMap.showStall(id); }
  function mapButton(name, cls) {
    var b = h("button", { class: "btn " + (cls || "btn-gold"), type: "button", text: "Show on the map" });
    b.addEventListener("click", function () { showOnMap(sid(name)); });
    return b;
  }

  /* ---------- Stall of the Week ---------- */

  function renderWinner() {
    var w = winners[0], el = $("mi-winner");
    if(!w){el.replaceChildren(h("p",{text:"No completed sales week has been exported."}));return;}
    clear(el);
    el.appendChild(h("div", { class: "mi-wk" }, [
      h("p", { class: "tag tag-gold", text: "LAST WEEK" }),
      h("p", { class: "mi-sub", text: range(-1) })
    ]));
    el.appendChild(h("div", { class: "mi-who" }, [
      head(w.name, 64),
      h("div", {}, [
        h("h3", { class: "mi-name", text: w.name }),
        h("p", { class: "mi-sub", text: sl(w.name) })
      ])
    ]));
    var dl = h("dl", { class: "meta" });
    [["Gold earned", gold(w.gold)], ["Items sold", String(w.sales??"Unavailable")], ["Different buyers", String(w.buyers??"Unavailable")]].forEach(function (r) {
      dl.appendChild(h("div", {}, [h("dt", { text: r[0] }), h("dd", { text: r[1] })]));
    });
    el.appendChild(dl);
    el.appendChild(h("p", { class: "mi-kick", text: "BEST SELLERS" }));
    var list = h("div", { class: "mi-top" });
    (w.best??[]).forEach(function (b) {
      list.appendChild(h("div", { class: "shop" }, [
        h("span", { text: b[0] + " x" + b[1] }),
        h("span", { style: "color:var(--muted)", text: gold(b[2]) + " raw gold" })
      ]));
    });
    el.appendChild(list);
    var honours = h("div", { class: "mi-wk" }, [
      h("span", { class: "tag tag-gold", text: "Top five " + streak(w.name, -1) + " weeks running" }),
      wins(w.name) > 1 ? h("span", { class: "tag tag-dark", text: "Stall of the Week " + wins(w.name) + " times" }) : null
    ]);
    el.insertBefore(honours, el.querySelector(".meta"));
    var share = h("button", { class: "btn btn-dark", type: "button", "aria-expanded": "false", text: "Share card" });
    var panel = h("div", { class: "mi-share", hidden: "" });
    share.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      share.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && !panel.firstChild) buildShare(w, panel);
    });
    el.appendChild(h("div", { style: "display:flex;flex-wrap:wrap;gap:12px" }, [mapButton(w.name), share]));
    el.appendChild(panel);
  }

  /* ---------- share card: a picture players can post on Discord ---------- */

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }
  function drawCard(w) {
    var c = document.createElement("canvas"), W = 1200, H = 630;
    c.width = W; c.height = H;
    var x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    var font = function (px) { return px + 'px "Minecraft", "Courier New", monospace'; };
    var ready = document.fonts && document.fonts.load ? Promise.all([document.fonts.load(font(32)), document.fonts.load("bold " + font(32))]) : Promise.resolve();
    return ready.then(function () {
      return Promise.all([loadImage("https://minotar.net/helm/" + encodeURIComponent(w.name) + "/128"), loadImage("assets/ui/logo-256.png")]);
    }).then(function (imgs) {
      x.fillStyle = "#c0261d"; x.fillRect(0, 0, W, H);
      x.fillStyle = "#4a0b08"; x.fillRect(0, 0, W, 12); x.fillRect(0, H - 12, W, 12); x.fillRect(0, 0, 12, H); x.fillRect(W - 12, 0, 12, H);
      x.fillStyle = "#ffcf1f"; x.fillRect(24, 24, W - 48, 8); x.fillRect(24, H - 32, W - 48, 8); x.fillRect(24, 24, 8, H - 48); x.fillRect(W - 32, 24, 8, H - 48);
      // fretwork corners
      [[44, 44, 1, 1], [W - 44, 44, -1, 1], [44, H - 44, 1, -1], [W - 44, H - 44, -1, -1]].forEach(function (k) {
        x.fillStyle = "#ffcf1f";
        x.fillRect(k[0] + (k[2] < 0 ? -40 : 0), k[1] + (k[3] < 0 ? -8 : 0), 40, 8);
        x.fillRect(k[0] + (k[2] < 0 ? -8 : 0), k[1] + (k[3] < 0 ? -40 : 0), 8, 40);
        x.fillRect(k[0] + k[2] * 16 + (k[2] < 0 ? -8 : 0), k[1] + k[3] * 16 + (k[3] < 0 ? -8 : 0), 8, 8);
      });
      x.fillStyle = "#a51b16"; x.fillRect(80, 150, W - 160, 380);
      x.textBaseline = "top";
      function text(t, px, color, X, Y, shadow) {
        x.font = font(px);
        if (shadow) { x.fillStyle = shadow; x.fillText(t, X + px / 8, Y + px / 8); }
        x.fillStyle = color; x.fillText(t, X, Y);
      }
      if (imgs[1]) x.drawImage(imgs[1], 80, 56, 72, 72);
      text("STALL OF THE WEEK", 48, "#ffdb2e", 172, 62, "#6b0f0b");
      x.font = font(24);
      text(range(-1), 24, "#ffe9a8", W - 80 - x.measureText(range(-1)).width, 80);
      x.fillStyle = "#4a0b08"; x.fillRect(112, 190, 200, 200);
      if (imgs[0]) x.drawImage(imgs[0], 120, 198, 184, 184);
      text(w.name, 56, "#ffdb2e", 352, 196, "#6b0f0b");
      text(sl(w.name) + " at the Enthusia Market", 24, "#fff6e0", 352, 270);
      text(gold(w.gold) + " raw gold earned", 40, "#ffffff", 352, 318, "#6b0f0b");
      text(String(w.sales??"Unavailable") + " items sold to " + w.buyers + " players", 24, "#ffdcc8", 352, 378);
      var best = "Best sellers: " + w.best.map(function (b) { return b[0]; }).join(", ");
      text(best, 24, "#ffe9a8", 112, 440);
      text("enthusia.info/market", 24, "#ffdb2e", 112, 560);
      text("PLAY.ENTHUSIA.NET", 24, "#fff6e0", W - 112 - 17 * 15, 560);
      return c;
    });
  }
  function buildShare(w, panel) {
    panel.appendChild(h("p", { class: "mi-sub", text: "Making the picture..." }));
    drawCard(w).then(function (canvas) {
      clear(panel);
      var url = "";
      try { url = canvas.toDataURL("image/png"); } catch (e) { url = ""; }
      if (!url) { panel.appendChild(h("p", { class: "mi-sub", text: "The picture could not be made in this browser." })); return; }
      var img = h("img", { class: "mi-share-img", alt: "Stall of the Week card for " + w.name + ": " + gold(w.gold) + " raw gold earned", width: "1200", height: "630" });
      img.src = url;
      var save = h("a", { class: "btn btn-gold", href: url, download: "enthusia-stall-of-the-week.png", text: "Save picture" });
      var copy = h("button", { class: "btn btn-dark", type: "button", text: "Copy link" });
      copy.addEventListener("click", function () {
        var link = location.origin + location.pathname + "#stall=" + encodeURIComponent(w.name);
        var done = function () { copy.textContent = "Link copied"; };
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, function () { copy.textContent = link; }); else copy.textContent = link;
      });
      panel.appendChild(img);
      panel.appendChild(h("div", { style: "display:flex;flex-wrap:wrap;gap:12px" }, [save, copy]));
      panel.appendChild(h("p", { class: "mi-sub", text: "Post it in Discord or anywhere else. The link opens this stall on the map." }));
    });
  }

  var wk = { off: 0, mode: "stalls" };
  function weekBoard(off) { return off===0?live:(model.boards?.[String(off)]??(winners[-off-1]?[winners[-off-1]]:[])); }
  function guildBoard(off) { return model.guildBoards?.[String(off)]??[]; }
  function streak(name,off) { return (weekBoard(off).find(row=>row.name===name)?.streak)??0; }
  function wins(name) { return winners.filter(w=>w.name===name).length; }
  function streakTag(name, off) {
    var n = streak(name, off);
    return n >= 2 ? h("span", { class: "tag tag-gold mi-streak", title: "In the top five " + n + " weeks in a row", text: n + " week streak" }) : null;
  }

  function renderWeek() {
    var el = $("mi-week");
    clear(el);
    el.appendChild(h("p", { class: "mi-kick", text: "LEADERBOARD" }));
    var title = h("h3", { text: "" }), sub = h("p", { class: "mi-sub", text: "" }), list = h("div", { class: "mi-top", "aria-live": "polite" }), btn = h("button", { class: "btn btn-dark", type: "button", text: "Show leader on the map" });
    var sel = h("select", { class: "field", id: "mi-wsel" });
    const offsets=model.preview?[0,-1,-2,-3,-4,-5,-6]:[...new Set([0,-1,...(model.weeks??[]).map(value=>Math.round((Date.parse(value)-Date.parse(model.currentWeek))/604800000))])];
    for(const o of offsets)sel.appendChild(h("option", { value: String(o), text: o === 0 ? "This week" : o === -1 ? "Last week" : range(o) }));
    var chips = h("div", { class: "mi-chips", role: "group", "aria-label": "Rank by" });
    var cs = h("button", { class: "chip", type: "button", "aria-pressed": "true", text: "Stalls" }), cg = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: "Guilds" });
    chips.appendChild(cs); chips.appendChild(cg);
    el.appendChild(title);
    el.appendChild(h("div", { class: "mi-wsel" }, [h("label", { class: "f" }, [h("span", { text: "Week" }), sel]), chips]));
    el.appendChild(sub); el.appendChild(list); el.appendChild(btn);

    let generation=0;
    async function draw() {
      const current=++generation,requested=wk.off,guildMode=wk.mode==='guilds';
      if(window.EnthusiaMarketDesignLoadWeek){try{await window.EnthusiaMarketDesignLoadWeek(requested,guildMode?'guild':'stall');}catch(error){list.replaceChildren(h('p',{class:'mi-empty',text:error.message}));return;}if(current!==generation)return;}
      var off = wk.off, guild = wk.mode === "guilds", rows = guild ? guildBoard(off) : weekBoard(off), top = rows[0]?.gold??0, left = daysLeft();
      if(!rows.length){clear(list);list.appendChild(h("p",{class:"mi-empty",text:"No recorded sales for this view."}));btn.hidden=true;return;}
      btn.hidden=false;
      title.textContent = guild ? "Guild of the week" : (off === 0 ? "This week so far" : "Top stalls");
      sub.textContent = off === 0 ? (left <= 1 ? (model.preview?"Ends tonight at 11:59 PM ET.":"Ends tonight in UTC.") : left + (model.preview?" days left. Ends Sunday at 11:59 PM ET.":" days left. Ends Sunday in UTC.")) : (guild ? rows[0].name + " won this week." : rows[0].name + " won this week with stall " + rows[0].stall + ".");
      clear(list);
      rows.forEach(function (r, i) {
        var who = guild ? h("span", { class: "slot", "aria-hidden": "true", style: "width:40px;height:40px", text: r.name.slice(0, 2).toUpperCase() }) : head(r.name, 40, "sm");
        var row = h("div", { class: "mi-rank" + (i === 0 ? " first" : "") }, [
          h("span", { class: "bar", style: "width:0" }),
          h("span", { class: "n", text: "#" + (i + 1) }), who,
          h("span", { style: "min-width:0;overflow-wrap:anywhere" }, [h("b", { style: "font-weight:400", text: r.name }), h("span", { class: "mi-sub", text: guild ? " · " + (r.stalls??"?") + (r.stalls === 1 ? " stall" : " stalls") : " · " + sl(r.name) }), guild ? null : streakTag(r.name, off)]),
          h("span", { class: "g", text: gold(r.gold) + " raw gold" })
        ]);
        list.appendChild(row);
        var bar = row.firstChild;
        requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = Math.round(r.gold / top * 100) + "%"; }); });
      });
      btn.style.display = !sid(rows[0].name) ? "none" : "";
      btn.onclick = function () { showOnMap(sid(rows[0].name)); };
    }
    sel.addEventListener("change", function () { wk.off = parseInt(sel.value, 10); draw(); });
    cs.addEventListener("click", function () { wk.mode = "stalls"; cs.setAttribute("aria-pressed", "true"); cg.setAttribute("aria-pressed", "false"); draw(); });
    cg.addEventListener("click", function () { wk.mode = "guilds"; cg.setAttribute("aria-pressed", "true"); cs.setAttribute("aria-pressed", "false"); draw(); });
    draw();
  }

  function renderHall() {
    var el = $("mi-hall");
    clear(el);
    winners.slice(1).forEach(function (w, i) {
      var card = h("div", { class: "panel mi-card" }, [
        h("p", { class: "tag tag-plain", style: "align-self:flex-start", text: range(-(i + 2)) }),
        h("div", { class: "mi-who" }, [
          head(w.name, 40, "sm"),
          h("div", {}, [h("b", { text: w.name }), h("span", { class: "mi-sub", text: sl(w.name) })])
        ]),
        h("p", { text: gold(w.gold) + " raw gold" }),
        streak(w.name, -(i + 2)) >= 2 ? h("span", { class: "tag tag-gold mi-streak", style: "align-self:flex-start", text: streak(w.name, -(i + 2)) + " week streak" }) : null
      ]);
      el.appendChild(card);
    });
  }

  /* ---------- Price Tracker ---------- */

  var state = { q: "", sort: "all", sel: items[0]?.name, idx: 29 };

  function spark(item) {
    if(!item.days.length)return h("span",{class:"mi-sub",text:"No history"});
    var pts = item.days.slice(16).map(function (p) { return p.avg; });
    var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), W = 112, H = 28;
    var span = mx - mn || 1;
    var d = pts.map(function (v, i) {
      return Math.round(i / (pts.length - 1) * (W - 4) + 2) + "," + Math.round(H - 4 - (v - mn) / span * (H - 8));
    }).join(" ");
    var svg = s("svg", { class: "mi-spark", viewBox: "0 0 " + W + " " + H, "aria-hidden": "true", focusable: "false" });
    svg.appendChild(s("polyline", { points: d, class: dir(item.d7)[0] }));
    return svg;
  }

  function change(p, cls) {
    return h("span", { class: "mi-" + dir(p) + " " + (cls || ""), text: pct(p) });
  }

  function visible() {
    var q = state.q.trim().toLowerCase();
    var list = items.filter(function (it) {
      if (q && it.name.toLowerCase().indexOf(q) === -1) return false;
      if (state.sort === "up") return it.d7 > 0.05;
      if (state.sort === "down") return it.d7 < -0.05;
      return true;
    });
    if (state.sort === "up") list.sort(function (a, b) { return b.d7 - a.d7; });
    else if (state.sort === "down") list.sort(function (a, b) { return a.d7 - b.d7; });
    else list.sort(function (a, b) { return b.sales - a.sales; });
    return list;
  }

  function initials(name) {
    var w = name.split(" ");
    return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
  }

  function renderRows() {
    var box = $("mi-rows"), list = visible();
    clear(box);
    if (!list.length) {
      box.appendChild(h("p", { class: "mi-empty", text: "No items match. Try another search." }));
      return;
    }
    list.forEach(function (it) {
      var row = h("button", { class: "mi-row mi-grid", type: "button", "aria-pressed": it.name === state.sel ? "true" : "false" }, [
        h("span", { class: "mi-item" }, [h("span", { class: "slot", "aria-hidden": "true", text: initials(it.name) }), h("span", { class: "t", text: it.name })]),
        h("span", { text: gold(it.price) }),
        change(it.d1),
        change(it.d7, "h7"),
        spark(it)
      ]);
      row.lastChild.setAttribute("class", "mi-spark hs");
      row.addEventListener("click", function () { state.sel = it.name; state.idx = it.days.length-1; renderRows(); renderDetail(); });
      box.appendChild(row);
    });
  }

  function current() {
    for (var i = 0; i < items.length; i++) if (items[i].name === state.sel) return items[i];
    return items[0];
  }

  function chart(it) {
    var W = 420, H = 240, L = 56, R = 404, T = 16, B = 200;
    var mn = it.lo * 0.97, mx = it.hi * 1.03, span = mx - mn || 1;
    function x(i) { return L + i / Math.max(1,it.days.length-1) * (R - L); }
    function y(v) { return B - (v - mn) / span * (B - T); }
    var svg = s("svg", { class: "mi-chart", viewBox: "0 0 " + W + " " + H, role: "img", tabindex: "0",
      "aria-label": it.name + " price over the last 30 days, now " + gold(it.price) + " gold, " + pct(it.d7) + " this week. Use the left and right arrow keys to read each day." });
    for (var g = 0; g < 4; g++) {
      var gy = T + g * (B - T) / 3, gv = mx - g * span / 3;
      svg.appendChild(s("line", { x1: L, x2: R, y1: gy, y2: gy, class: "grid" }));
      var t = s("text", { x: L - 8, y: gy + 5, "text-anchor": "end" }); t.textContent = gold(gv); svg.appendChild(t);
    }
    var band = it.days.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.hi).toFixed(1); })
      .concat(it.days.slice().reverse().map(function (p, i) { return x(it.days.length-1-i).toFixed(1) + "," + y(p.lo).toFixed(1); }));
    if(model.preview)svg.appendChild(s("polygon", { points: band.join(" "), class: "band" }));
    svg.appendChild(s("polyline", { points: it.days.map(function (p, i) { return x(i).toFixed(1) + "," + y(p.avg).toFixed(1); }).join(" "), class: "avg" }));
    [["30 days ago", L, "start"], ["15 days", (L + R) / 2, "middle"], ["Today", R, "end"]].forEach(function (a) {
      var tx = s("text", { x: a[1], y: H - 12, "text-anchor": a[2] }); tx.textContent = a[0]; svg.appendChild(tx);
    });
    var cur = s("line", { class: "cur", y1: T, y2: B, x1: x(state.idx), x2: x(state.idx) });
    var dot = s("rect", { class: "pt", width: 12, height: 12, x: x(state.idx) - 6, y: y(it.days[state.idx].avg) - 6 });
    svg.appendChild(cur); svg.appendChild(dot);
    return { svg: svg, move: function (i) { cur.setAttribute("x1", x(i)); cur.setAttribute("x2", x(i)); dot.setAttribute("x", x(i) - 6); dot.setAttribute("y", y(it.days[i].avg) - 6); } };
  }

  function dayLabel(i) {
    var d = new Date(); d.setDate(d.getDate() - (29 - i));
    return i === 29 ? "Today" : day(d);
  }
  function readout(it, i) {
    var p = it.days[i];
    return (it.days[i].day ?? dayLabel(i)) + " · average " + gold(p.avg) + " · low " + gold(p.lo) + " · high " + gold(p.hi) + " raw gold";
  }

  function renderDetail() {
    var it = current(), el = $("mi-detail");
    clear(el);
    el.appendChild(h("p", { class: "mi-kick", text: "30 DAY CHART" }));
    el.appendChild(h("h3", { text: it.name }));
    el.appendChild(h("p", { class: "mi-price", text: gold(it.price) + " raw gold each" }));
    el.appendChild(h("div", { class: "mi-wk" }, [
      h("span", { class: "tag " + (dir(it.d1) === "up" ? "tag-good" : dir(it.d1) === "down" ? "tag-red" : "tag-plain"), text: (model.preview?"24h ":"Daily change ") + pct(it.d1) }),
      h("span", { class: "tag " + (dir(it.d7) === "up" ? "tag-good" : dir(it.d7) === "down" ? "tag-red" : "tag-plain"), text: (model.preview?"7d ":"30d ") + pct(it.d7) })
    ]));
    if(!it.days.length){el.appendChild(h('p',{class:'mi-note',text:'Select this item to load its recorded daily history.'}));el.appendChild(alertBox(it));window.EnthusiaMarketDesignLoadHistory?.(it);return;}
    state.idx=Math.max(0,Math.min(state.idx,it.days.length-1));
    var c = chart(it), read = h("p", { class: "mi-read", text: readout(it, state.idx) });
    function setIdx(i) { state.idx = Math.max(0, Math.min(it.days.length-1, i)); c.move(state.idx); read.textContent = readout(it, state.idx); }
    function fromEvent(e) {
      var r = c.svg.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 420;
      setIdx(Math.round((px - 56) / (404 - 56) * (it.days.length-1)));
    }
    c.svg.addEventListener("pointermove", fromEvent);
    c.svg.addEventListener("pointerdown", fromEvent);
    c.svg.addEventListener("pointerleave", function () { setIdx(it.days.length-1); });
    c.svg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { setIdx(state.idx - 1); e.preventDefault(); }
      else if (e.key === "ArrowRight") { setIdx(state.idx + 1); e.preventDefault(); }
      else if (e.key === "Home") { setIdx(0); e.preventDefault(); }
      else if (e.key === "End") { setIdx(it.days.length-1); e.preventDefault(); }
    });
    el.appendChild(c.svg);
    el.appendChild(read);
    var dl = h("dl", { class: "meta" });
    [["Average", gold(it.mean)], [model.preview?"Lowest":"Lowest daily average", gold(it.lo)], [model.preview?"Highest":"Highest daily average", gold(it.hi)], ["Sales", it.sales.toLocaleString("en-US")]].forEach(function (r) {
      dl.appendChild(h("div", {}, [h("dt", { text: r[0] }), h("dd", { text: r[1] })]));
    });
    el.appendChild(dl);
    el.appendChild(h("p", { class: "mi-note", text: model.preview?"The red line is the daily average. The shaded band runs from the day's lowest to highest sale.":"The red line shows recorded daily averages. No individual sale low/high range has been exported." }));
    el.appendChild(alertBox(it));
  }

  /* ---------- price alerts (sent as a Discord message by the Enthusia bot) ---------- */

  function itemByName(name){return items.find(item=>item.name===name);}
  function alertBox(it) {
    var box=h('div',{class:'mi-alert'},[h('p',{class:'mi-kick',text:'PRICE ALERT'}),h('h3',{text:'Tell me when the price moves'})]);
    var when=h('select',{class:'field','aria-label':'Alert when the price'},[h('option',{value:'below',text:'drops to or below'})]);
    var price=h('input',{class:'field',type:'number',min:'0',step:'any',inputmode:'decimal','aria-label':'Price in raw gold',value:String(it.price*.9)});
    var add=h('button',{class:'btn btn-gold',type:'button',text:'Alert me on Discord'}),status=h('p',{class:'mi-sub',role:'status'}),list=h('div',{class:'mi-top'});
    box.appendChild(h('div',{class:'mi-alert-row'},[h('span',{text:it.name}),when,price,h('span',{text:'raw gold'}),add]));box.appendChild(status);box.appendChild(list);
    async function draw(){try{var data=await window.EnthusiaMarketDesignApi('alerts');clear(list);for(const alert of data.items){var remove=h('button',{class:'linkbtn',type:'button',text:'Remove'});remove.addEventListener('click',async()=>{try{await window.EnthusiaMarketDesignApi('alerts',{method:'POST',body:JSON.stringify({item:alert.item,remove:true})});await draw();}catch(error){status.textContent=error.message;}});list.appendChild(h('div',{class:'shop'},[h('span',{text:alert.item+' at or below '+gold(alert.threshold)}),remove]));}}catch(error){if(!document.documentElement.hasAttribute('data-preview-root'))status.textContent=error.message;}}
    add.addEventListener('click',async()=>{add.disabled=true;try{await window.EnthusiaMarketDesignApi('alerts',{method:'POST',body:JSON.stringify({item:it.key??it.name,threshold:Number(price.value)})});status.textContent='Saved. Discord delivery requires the alert worker to be enabled.';await draw();}catch(error){status.textContent=error.message;}finally{add.disabled=false;}});
    draw();box.appendChild(h('p',{class:'mi-note',text:'Requires your linked Discord account. Delivery is enabled by the server operator.'}));return box;
  }
  /* ---------- movers + most traded ---------- */

  function selectItem(name) {
    state.sel = name; state.idx = current().days.length-1; state.q = ""; state.sort = "all";
    var q = $("mi-q"); if (q) q.value = "";
    Array.prototype.forEach.call(document.querySelectorAll("[data-mi-sort]"), function (o) { o.setAttribute("aria-pressed", o.getAttribute("data-mi-sort") === "all" ? "true" : "false"); });
    renderRows(); renderDetail();
  }
  function moverList(title, kick, list) {
    var card = h("div", { class: "panel mi-card" }, [h("p", { class: "mi-kick", text: kick }), h("h3", { text: title })]);
    list.forEach(function (it) {
      var row = h("button", { class: "mi-row mi-grid mi-mv", type: "button" }, [
        h("span", { class: "mi-item" }, [h("span", { class: "slot", "aria-hidden": "true", text: initials(it.name) }), h("span", { class: "t", text: it.name })]),
        h("span", { text: gold(it.price) }),
        change(it.d7)
      ]);
      row.addEventListener("click", function () { selectItem(it.name); var d = $("mi-detail"); if (d && d.getBoundingClientRect().top > innerHeight) d.scrollIntoView({ behavior: "smooth", block: "center" }); });
      card.appendChild(row);
    });
    return card;
  }
  function renderMovers() {
    var el = $("mi-movers"); clear(el);
    var byUp = items.slice().sort(function (a, b) { return b.d7 - a.d7; });
    el.appendChild(moverList(model.preview?"Biggest risers this week":"Biggest risers over 30 days", model.preview?"7 DAY CHANGE":"30 DAY CHANGE", byUp.slice(0, 3)));
    el.appendChild(moverList(model.preview?"Biggest fallers this week":"Biggest fallers over 30 days", model.preview?"7 DAY CHANGE":"30 DAY CHANGE", byUp.slice(-3).reverse()));
  }
  function renderTraded() {
    var el = $("mi-traded"); clear(el);
    el.appendChild(h("p", { class: "mi-kick", text: "30 DAYS" }));
    el.appendChild(h("h3", { text: "Most traded items" }));
    if(!items.length){el.appendChild(h("p",{text:"No completed item sales yet."}));return;}
    var top = items.slice().sort(function (a, b) { return b.sales - a.sales; }).slice(0, 5), max = top[0].sales, list = h("div", { class: "mi-top" });
    top.forEach(function (it, i) {
      var row = h("div", { class: "mi-rank" + (i === 0 ? " first" : "") }, [
        h("span", { class: "bar", style: "width:0" }), h("span", { class: "n", text: "#" + (i + 1) }),
        h("span", { class: "slot", "aria-hidden": "true", style: "width:40px;height:40px", text: initials(it.name) }),
        h("span", { text: it.name }), h("span", { class: "g", text: it.sales.toLocaleString("en-US") + " sold" })
      ]);
      list.appendChild(row);
      var bar = row.firstChild; requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.width = Math.round(it.sales / max * 100) + "%"; }); });
    });
    el.appendChild(list);
  }

  /* ---------- real map: price badges + extra layers ---------- */

  var MATERIAL = {};
  items.forEach(function (it) { MATERIAL[it.name.toUpperCase().replace(/ /g, "_")] = it; });
  function shopVerdict(shop) {
    const item=MATERIAL[shop.sellItem?.material];
    return item?window.EnthusiaMarketPriceVerdict(shop,item.price):null;
  }
  function goldOf(stall) {
    if (!stall || stall.owner.type === "NONE") return 0;
    var live = null;
    for (var i = 0; i < 5; i++) if (sid(live5[i].name) === stall.id) live = live5[i];
    if (live) return live.gold;

    return model.stallTotals?.[stall.id]??0;
  }
  var live5 = live;

  var provider = {
    layers: [
      { id: "prices", label: "Prices", legend: [["cheap", "Cheap: 5% or more under average"], ["fair", "Fair"], ["pricey", "Pricey: 5% or more over"]] },
      { id: "gold", label: "Weekly gold", legend: [["hot", "Top 3 buildings"], ["warm", "Next 4"], ["cool", "Quieter"]] }
    ],
    describe: function (layerId, building, byId) {
      var stalls = building.stallIds.map(function (id) { return byId.get(id); }).filter(Boolean);
      if (layerId === "prices") {
        var best = null;
        stalls.forEach(function (st) { st.shops.forEach(function (shop) { var v = shopVerdict(shop); if (v && (!best || v.p < best.p)) best = v; }); });
        if (!best) return { bucket: "none", label: "", line: "No comparable prices here" };
        return { bucket: best.kind, label: pct(best.p), line: "Best price: " + best.label + " " + pct(best.p) + " vs the 30 day average" };
      }
      var total = stalls.reduce(function (sum, st) { return sum + goldOf(st); }, 0);
      var totals = window.EnthusiaMarketMap.layout.buildings.map(function (bd) { return bd.stallIds.reduce(function (sum, id) { return sum + goldOf(byId.get(id)); }, 0); }).sort(function (x, y) { return y - x; });
      var bucket = !total ? "none" : total >= totals[2] ? "hot" : total >= totals[6] ? "warm" : "cool";
      return { bucket: bucket, label: total ? compact(total) : "", line: total ? gold(total) + " raw gold earned this week" : "No sales this week" };
    }
  };
  function compact(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n); }

  function badgeFor(shop) {
    var v=shopVerdict(shop);return v?{kind:v.kind,text:v.label+' '+pct(v.p)+' vs 30 day average'}:null;
  }
  var ready = false;
  function onSnapshot() {
    var snap = window.EnthusiaMarketMap.getSnapshot();
    if (!snap || ready) return;
    ready = true;
    snap.stalls.forEach(function (st) {
      if (st.owner.type === "PLAYER" && !ownerStall[st.owner.name]) ownerStall[st.owner.name] = st.id;
      if (st.owner.type === "GUILD" && !guildStall[st.owner.name]) guildStall[st.owner.name] = st.id;
    });
    var count = {};
    snap.stalls.forEach(function (st) { if (st.owner.type === "GUILD") count[st.owner.name] = (count[st.owner.name] || 0) + 1; });
    var names = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
    if (names.length >= 3) model.guildNames = names.map(function (n) { return [n, count[n]]; });
    renderWinner(); renderWeek(); renderHall();
    followHash();
  }

  // market.html#stall=Name opens that player's stall; #item=Name opens the price chart.
  function followHash() {
    var m = location.hash.match(/^#(stall|item)=(.+)$/);
    if (!m) return;
    var name = decodeURIComponent(m[2]);
    if (m[1] === "stall" && sid(name)) showOnMap(sid(name));
    if (m[1] === "item" && itemByName(name)) {
      selectItem(name);
      var t = $("price-tracker"); if (t) t.scrollIntoView({ block: "start" });
    }
  }

  /* ---------- home page strip ---------- */

  function renderStrip() {
    var el = $("mi-strip"), w = winners[0], lead = live[0];
    if(!w||!lead||!items.length){el.replaceChildren(h("a",{class:"btn btn-dark mi-strip-tile",href:"market.html",text:"Explore player shops. Sales insights await a server export."}));return;}
    var up = items.slice().sort(function (a, b) { return b.d7 - a.d7; })[0];
    var down = items.slice().sort(function (a, b) { return a.d7 - b.d7; })[0];
    clear(el);
    function tile(href, kick, kids) {
      return h("a", { class: "btn btn-dark mi-strip-tile", href: href }, [h("span", { class: "mi-kick", text: kick })].concat(kids));
    }
    el.appendChild(tile("market.html#stall-week", "STALL OF THE WEEK", [
      h("span", { class: "mi-who" }, [head(w.name, 40, "sm"), h("span", { class: "mi-strip-big", text: w.name })]),
      h("span", { class: "mi-sub", text: gold(w.gold) + " raw gold last week" })
    ]));
    el.appendChild(tile("market.html#stall-week", "LEADING THIS WEEK", [
      h("span", { class: "mi-who" }, [head(lead.name, 40, "sm"), h("span", { class: "mi-strip-big", text: lead.name })]),
      h("span", { class: "mi-sub", text: gold(lead.gold) + " raw gold so far" })
    ]));
    el.appendChild(tile("market.html#item=" + encodeURIComponent(up.name), "BIGGEST RISER", [
      h("span", { class: "mi-strip-big", text: up.name }),
      h("span", {}, [change(up.d7), h("span", { class: "mi-sub", text: (model.preview?" this week · ":" over 30 days · ") + gold(up.price) + " raw gold" })])
    ]));
    el.appendChild(tile("market.html#item=" + encodeURIComponent(down.name), "BIGGEST FALLER", [
      h("span", { class: "mi-strip-big", text: down.name }),
      h("span", {}, [change(down.d7), h("span", { class: "mi-sub", text: (model.preview?" this week · ":" over 30 days · ") + gold(down.price) + " raw gold" })])
    ]));
  }

  function initMap() {
    var map = window.EnthusiaMarketMap;
    if (!map) return;
    window.EnthusiaMarketLayerProvider = provider;
    map.shopBadge = badgeFor;
    map.subscribe(onSnapshot);
    if (window.EnthusiaMarketLayers && window.EnthusiaMarketLayers.refresh) window.EnthusiaMarketLayers.refresh();
    onSnapshot();
  }

  function init() {
    if ($("mi-strip")) renderStrip();
    if (!$("mi-winner")) return;
    renderWinner(); renderWeek(); renderHall();
    if(items.length){renderRows(); renderDetail(); renderMovers(); renderTraded();} initMap();
    $("mi-q").addEventListener("input", function (e) { state.q = e.target.value; renderRows(); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-mi-sort]"), function (b) {
      b.addEventListener("click", function () {
        state.sort = b.getAttribute("data-mi-sort");
        Array.prototype.forEach.call(document.querySelectorAll("[data-mi-sort]"), function (o) {
          o.setAttribute("aria-pressed", o === b ? "true" : "false");
        });
        renderRows();
      });
    });
  }
  window.EnthusiaMarketDesignRefresh=()=>{renderRows();renderDetail();};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
