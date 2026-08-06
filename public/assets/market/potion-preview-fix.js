(function (root) {
  "use strict";

  const FORM_BY_MATERIAL = Object.freeze({
    POTION: "POTION",
    SPLASH_POTION: "SPLASH",
    LINGERING_POTION: "LINGERING",
    TIPPED_ARROW: "TIPPED_ARROW"
  });
  const manifestUrl = "assets/market/minecraft/potion-variant-manifest.json";
  let colorsPromise;

  function potionId(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const normalized = value.trim().toLowerCase();
    return normalized.includes(":") ? normalized : `minecraft:${normalized}`;
  }

  function colorIndex(manifest) {
    const colors = new Map();
    for (const entry of manifest?.items || []) {
      if (!entry?.potionId || !entry?.form || !entry?.exactTintColor) continue;
      colors.set(`${entry.form}:${entry.potionId.toLowerCase()}`, entry.exactTintColor.toLowerCase());
    }
    return colors;
  }

  async function potionColors() {
    if (!colorsPromise) {
      colorsPromise = fetch(manifestUrl, { cache: "force-cache", credentials: "same-origin" })
        .then(response => {
          if (!response.ok) throw new Error(`Potion manifest returned ${response.status}`);
          return response.json();
        })
        .then(colorIndex)
        .catch(() => new Map());
    }
    return colorsPromise;
  }

  function visitItem(item, colors, depth = 0) {
    if (!item || depth > 4) return item;
    const potion = item.metadata?.potion;
    const id = potionId(potion?.id || potion?.basePotion);
    const form = FORM_BY_MATERIAL[item.material];
    if (potion && id && form) {
      potion.id = id;
      const exactColor = colors.get(`${form}:${id}`);
      if (exactColor) potion.color = exactColor;
    }
    for (const entry of item.metadata?.container?.contents || []) visitItem(entry.item, colors, depth + 1);
    return item;
  }

  function visitStall(stall, colors) {
    for (const shop of stall?.shops || []) {
      visitItem(shop.sellItem, colors);
      visitItem(shop.costItem, colors);
    }
    return stall;
  }

  function visitSnapshot(snapshot, colors) {
    for (const stall of snapshot?.stalls || []) visitStall(stall, colors);
    return snapshot;
  }

  root.EnthusiaPotionPreview = Object.freeze({ colorIndex, potionId, visitItem, visitSnapshot, visitStall });

  const Api = root.EnthusiaMarketApi?.MarketApiClient;
  if (!Api) return;

  const originalFetchSnapshot = Api.prototype.fetchSnapshot;
  Api.prototype.fetchSnapshot = async function () {
    const [snapshot, colors] = await Promise.all([originalFetchSnapshot.call(this), potionColors()]);
    return visitSnapshot(snapshot, colors);
  };

  const originalLoadInitialSnapshot = Api.prototype.loadInitialSnapshot;
  Api.prototype.loadInitialSnapshot = async function () {
    const [snapshot, colors] = await Promise.all([originalLoadInitialSnapshot.call(this), potionColors()]);
    return visitSnapshot(snapshot, colors);
  };

  const originalHandleMessage = Api.prototype.handleMessage;
  Api.prototype.handleMessage = function (raw) {
    let event;
    try { event = JSON.parse(raw); } catch { return originalHandleMessage.call(this, raw); }
    if (!event?.stall) return originalHandleMessage.call(this, raw);
    this.potionPreviewQueue = (this.potionPreviewQueue || Promise.resolve())
      .then(() => potionColors())
      .then(colors => originalHandleMessage.call(this, JSON.stringify({ ...event, stall: visitStall(event.stall, colors) })));
    return this.potionPreviewQueue;
  };
})(globalThis);
