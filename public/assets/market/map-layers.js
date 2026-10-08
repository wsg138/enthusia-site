(function (root, factory) {
  "use strict";
  root.EnthusiaMarketLayers = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const HOUR = 3600000, DAY = 24 * HOUR;
  const LAYERS = [
    { id: "default", label: "Map", legend: [] },
    { id: "free", label: "Free stalls", legend: [["free", "Has a free stall"], ["none", "Fully rented"]] },
    { id: "rent", label: "Rent", legend: [["overdue", "Overdue or grace"], ["urgent", "Under 1 day"], ["soon", "Under 3 days"], ["healthy", "3 days or more"], ["auction", "Auction"]] },
    { id: "shops", label: "Shops", legend: [["heat1", "1 to 3 shops"], ["heat2", "4 to 8"], ["heat3", "9 to 14"], ["heat4", "15 or more"]] },
    { id: "stock", label: "Stock", legend: [["in", "Everything in stock"], ["mixed", "Some sold out"], ["out", "All sold out"]] }
  ];
  const RENT_SEVERITY = { overdue: 6, urgent: 5, auction: 4, soon: 3, healthy: 2, unknown: 1, available: 0 };

  const compactTime = ms => {
    const hours = ms / HOUR;
    if (hours < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
    return hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
  };

  // One stall's rent position. Mirrors the states the drawer already shows, as short labels for the map.
  function rentInfo(stall, now = Date.now()) {
    const state = stall.stallState || (stall.owner?.type === "NONE" ? "UNOWNED" : "OWNED");
    if (state === "UNOWNED") return { bucket: "available", label: "Free", text: "Available to rent" };
    if (state === "AUCTIONING" || state === "RE_AUCTIONING") return { bucket: "auction", label: "Auction", text: "Auction active" };
    if (state === "EMERGENCY_AUCTIONING" || state === "GRACE") return { bucket: "overdue", label: "Late", text: "Rent overdue" };
    const due = stall.nextRentAt ? new Date(stall.nextRentAt).getTime() : NaN;
    if (!Number.isFinite(due)) return { bucket: "unknown", label: "?", text: "Rent time unavailable" };
    const ms = due - now;
    if (ms <= 0) return { bucket: "overdue", label: "Late", text: "Rent overdue" };
    const bucket = ms < DAY ? "urgent" : ms < 3 * DAY ? "soon" : "healthy";
    return { bucket, label: compactTime(ms), text: `Rent due in ${compactTime(ms)}` };
  }

  function summarize(building, stallsById, now = Date.now()) {
    const stalls = building.stallIds.map(id => stallsById.get(id)).filter(Boolean);
    let shops = 0, inStock = 0, free = 0, worst = null;
    for (const stall of stalls) {
      for (const shop of stall.shops || []) { shops += 1; if (shop.stockCount > 0) inStock += 1; }
      const rent = rentInfo(stall, now);
      if (rent.bucket === "available") free += 1;
      if (!worst || RENT_SEVERITY[rent.bucket] > RENT_SEVERITY[worst.rent.bucket]) worst = { stall, rent };
    }
    return { stalls: stalls.length, shops, inStock, outOfStock: shops - inStock, free, worst };
  }

  const heat = shops => (shops >= 15 ? "heat4" : shops >= 9 ? "heat3" : shops >= 4 ? "heat2" : shops >= 1 ? "heat1" : "none");

  // The map colour bucket, short map label and tooltip line for one building under one layer.
  function describe(layer, summary) {
    if (!summary || !summary.stalls) return { bucket: "none", label: "", line: "" };
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    switch (layer) {
      case "free":
        return { bucket: summary.free ? "free" : "none", label: summary.free ? String(summary.free) : "", line: `${summary.free} of ${plural(summary.stalls, "stall")} free` };
      case "rent": {
        const worst = summary.worst, bucket = worst.rent.bucket;
        const name = `Stall ${String(worst.stall.id).match(/\d+/)?.[0] || worst.stall.id}`;
        return { bucket: bucket === "unknown" || bucket === "available" ? "none" : bucket, label: bucket === "available" ? "" : worst.rent.label, line: bucket === "available" ? "Every stall here is free" : `${worst.rent.text} · ${name}` };
      }
      case "shops":
        return { bucket: heat(summary.shops), label: summary.shops ? String(summary.shops) : "", line: `${plural(summary.shops, "shop")} across ${plural(summary.stalls, "stall")}` };
      case "stock": {
        if (!summary.shops) return { bucket: "none", label: "", line: "No shops listed" };
        const bucket = summary.outOfStock === 0 ? "in" : summary.inStock === 0 ? "out" : "mixed";
        return { bucket, label: `${summary.inStock}/${summary.shops}`, line: `${summary.inStock} in stock · ${summary.outOfStock} sold out` };
      }
      default:
        return { bucket: "none", label: "", line: `${plural(summary.stalls, "stall")} · ${plural(summary.shops, "shop")}` };
    }
  }

  // Optional extra layers (Prices, Weekly gold) come from root.EnthusiaMarketLayerProvider once the sales API exists:
  // { layers: [{ id, label, legend }], describe(layerId, building, stallsById) -> { bucket, label, line } }
  const allLayers = () => LAYERS.concat(root.EnthusiaMarketLayerProvider?.layers || []);
  function layerById(id) { return allLayers().find(layer => layer.id === id) || LAYERS[0]; }

  const api = { LAYERS, allLayers, rentInfo, summarize, describe, heat, refresh() {} };

  // ---------- page wiring ----------
  function init() {
    const map = root.EnthusiaMarketMap;
    if (!map || typeof document === "undefined") return;
    const card = document.querySelector(".map-card"), heading = card?.querySelector(".map-heading"), viewport = document.getElementById("market-map");
    if (!card || !heading || !viewport) return;
    const ns = "http://www.w3.org/2000/svg", t = map.layout.renderTransform;
    const px = point => ({ x: (point.x - t.originX) * t.pixelsPerBlock, y: (point.z - t.originZ) * t.pixelsPerBlock });
    let current = layerById(new URLSearchParams(location.search).get("layer")).id;

    const bar = document.createElement("div");
    bar.className = "layer-bar"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Map layer");
    const caption = document.createElement("span"); caption.className = "layer-caption"; caption.textContent = "Layer"; bar.append(caption);
    let buttons = [];
    function buildButtons() {
      buttons.forEach(button => button.remove());
      buttons = allLayers().map(layer => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "layer-button"; button.dataset.layer = layer.id; button.textContent = layer.label;
        button.addEventListener("click", () => select(layer.id));
        bar.append(button); return button;
      });
    }
    buildButtons();
    heading.after(bar);
    const legend = document.createElement("div");
    legend.id = "layer-legend"; legend.className = "layer-legend"; legend.setAttribute("aria-live", "polite");
    viewport.after(legend);

    const labels = document.createElementNS(ns, "g");
    labels.id = "layer-label-layer"; labels.setAttribute("pointer-events", "none");
    map.svg.append(labels);
    const texts = new Map();
    for (const building of map.layout.buildings) {
      const text = document.createElementNS(ns, "text"), at = px(building.labelPoint || building.footprint[0]);
      text.setAttribute("x", at.x); text.setAttribute("y", at.y); text.setAttribute("class", "layer-label");
      labels.append(text); texts.set(building.id, text);
    }

    const lines = new Map();
    function render() {
      const snapshot = map.getSnapshot();
      card.dataset.layer = current;
      buttons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.layer === current)));
      legend.textContent = "";
      for (const [bucket, label] of layerById(current).legend) {
        const item = document.createElement("span"); item.className = "layer-key";
        const swatch = document.createElement("i"); swatch.dataset.bucket = bucket; swatch.setAttribute("aria-hidden", "true");
        item.append(swatch, label); legend.append(item);
      }
      const stallsById = new Map((snapshot?.stalls || []).map(stall => [stall.id, stall]));
      for (const building of map.layout.buildings) {
        const shape = map.buildingElements.get(building.id), text = texts.get(building.id);
        const extra = root.EnthusiaMarketLayerProvider?.layers?.some(layer => layer.id === current);
        const info = extra ? (snapshot ? root.EnthusiaMarketLayerProvider.describe(current, building, stallsById) : { bucket: "none", label: "", line: "" })
          : describe(current, snapshot ? summarize(building, stallsById) : null);
        lines.set(building.id, info.line);
        if (shape) { if (current === "default") shape.removeAttribute("data-bucket"); else shape.dataset.bucket = info.bucket; }
        text.textContent = current === "default" ? "" : info.label;
        text.dataset.hidden = String(!info.label || !!shape?.classList.contains("filtered"));
      }
    }
    function select(id) {
      current = layerById(id).id;
      try { const url = new URL(location.href); if (current === "default") url.searchParams.delete("layer"); else url.searchParams.set("layer", current); history.replaceState(null, "", url); } catch (error) { /* the layer still works without a shareable URL */ }
      render();
    }
    map.subscribe(render);
    api.refresh = () => { if (buttons.length !== allLayers().length) buildButtons(); current = layerById(current).id; render(); };
    map.tooltipLine = building => lines.get(building.id) || "";
    render();
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
  return api;
});
