(function () {
  "use strict";

  const C = window.EnthusiaMapCore;
  const layout = window.ENTHUSIA_MARKET_DATA.layout;
  const snapshot = window.ENTHUSIA_MARKET_DATA.snapshot;
  const iconManifest = window.ENTHUSIA_MINECRAFT_ASSETS;
  const adapter = new window.EnthusiaMarketAdapter.StaticMarketAdapter(layout, snapshot);
  const $ = selector => document.querySelector(selector);
  const ns = "http://www.w3.org/2000/svg";
  const t = layout.renderTransform;
  const assetBase = document.querySelector("[data-market-asset-base]")?.dataset.marketAssetBase || $("#site-logo").getAttribute("src").replace(/[^/]+$/, "");
  const cssAssetBase = document.querySelector("[data-market-css-asset-base]")?.dataset.marketCssAssetBase ?? assetBase;
  const el = {
    viewport: $("#market-map"), scene: $("#map-scene"), svg: $("#map-svg"), buildings: $("#building-layer"),
    stalls: $("#stall-layer"), tooltip: $("#map-tooltip"), hud: $("#coordinate-hud"), results: $("#search-results"),
    drawer: $("#market-drawer"), backdrop: $("#drawer-backdrop"), content: $("#drawer-content"), title: $("#drawer-title"),
    kicker: $("#drawer-kicker"), summary: $("#drawer-summary"), back: $("#drawer-back"), inspector: $("#item-inspector"),
    inspectorContent: $("#inspector-content"), inspectorTitle: $("#inspector-title"), inspectorKicker: $("#inspector-kicker")
  };

  const filterFields = $("#filter-fields");
  const searchLabel = document.createElement("label");
  searchLabel.innerHTML = `Search stalls<input id="market-filter-search" placeholder="Stall, player, guild, item">`;
  filterFields.prepend(searchLabel);
  el.scene.style.width = `${t.imageWidth}px`;
  el.scene.style.height = `${t.imageHeight}px`;
  el.svg.setAttribute("viewBox", `0 0 ${t.imageWidth} ${t.imageHeight}`);

  const state = {
    view: { scale: 1, x: 0, y: 0 }, initial: null, pointer: null, cursor: null, hovered: null,
    selectedBuilding: null, selectedStall: null, drawerMode: null, drawerBuilding: null, highlightShop: null,
    inspectorHistory: [], filters: { text: "", floor: "ALL", owner: "ALL", shop: "ALL", stock: "ALL" },
    matching: new Set(layout.stalls.map(stall => stall.id)), suggestionIndex: -1
  };
  const buildingElements = new Map();
  const stallElements = new Map();
  const px = point => ({ x: (point.x - t.originX) * t.pixelsPerBlock, y: (point.z - t.originZ) * t.pixelsPerBlock });
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const displayStall = id => `Stall ${String(id).match(/\d+/)?.[0] || id}`;
  const makeSvg = (name, attributes = {}) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };

  function initMap() {
    for (const building of layout.buildings) {
      const polygon = makeSvg("polygon", {
        points: building.footprint.map(px).map(point => `${point.x},${point.y}`).join(" "), class: "building-shape",
        tabindex: "0", focusable: "true", role: "button", "aria-label": building.label
      });
      polygon.onfocus = () => showFocusedTooltip(building);
      polygon.onblur = () => { if (state.hovered !== building.id) hideTooltip(); };
      polygon.onkeydown = event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBuilding(building); }
      };
      el.buildings.append(polygon);
      buildingElements.set(building.id, polygon);
    }
    for (const stall of layout.stalls) {
      const polygon = makeSvg("polygon", {
        points: stall.polygon.map(px).map(point => `${point.x},${point.y}`).join(" "), class: "stall-shape"
      });
      el.stalls.append(polygon);
      stallElements.set(stall.id, polygon);
    }
  }

  function screenWorld(clientX, clientY) {
    const rect = el.viewport.getBoundingClientRect();
    const sceneX = (clientX - rect.left - state.view.x) / state.view.scale;
    const sceneY = (clientY - rect.top - state.view.y) / state.view.scale;
    return { x: t.originX + sceneX / t.pixelsPerBlock, z: t.originZ + sceneY / t.pixelsPerBlock };
  }
  function hitBuilding(clientX, clientY) { return C.hitTestBuildings(layout.buildings, screenWorld(clientX, clientY)); }
  function showTooltip(building, clientX, clientY) {
    const rect = el.viewport.getBoundingClientRect();
    el.tooltip.hidden = false;
    el.tooltip.textContent = building.label;
    el.tooltip.style.left = `${clientX - rect.left + 12}px`;
    el.tooltip.style.top = `${clientY - rect.top + 12}px`;
  }
  function showFocusedTooltip(building) {
    const point = px(building.labelPoint || C.interiorLabelPoint(building.footprint));
    const rect = el.viewport.getBoundingClientRect();
    showTooltip(building, rect.left + state.view.x + point.x * state.view.scale, rect.top + state.view.y + point.y * state.view.scale);
  }
  function hideTooltip() { el.tooltip.hidden = true; }
  function updateHud(pointer = state.cursor) {
    if (!pointer) { el.hud.textContent = "X — · Z —"; return; }
    const point = screenWorld(pointer.clientX, pointer.clientY);
    el.hud.textContent = `X ${point.x.toFixed(1)} · Z ${point.z.toFixed(1)}`;
  }
  function setHover(building, event) {
    if (state.hovered !== building?.id) {
      if (state.hovered) buildingElements.get(state.hovered)?.classList.remove("hovered");
      state.hovered = building?.id || null;
      if (building) buildingElements.get(building.id)?.classList.add("hovered");
    }
    if (building && event) showTooltip(building, event.clientX, event.clientY);
    else if (!building) hideTooltip();
  }

  el.viewport.onpointerdown = event => {
    state.cursor = { clientX: event.clientX, clientY: event.clientY };
    updateHud();
    if (event.button !== 0) return;
    const hit = hitBuilding(event.clientX, event.clientY);
    state.pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, drag: false, pressed: hit?.id || null };
    if (hit) buildingElements.get(hit.id)?.classList.add("pressed");
  };
  el.viewport.onpointermove = event => {
    state.cursor = { clientX: event.clientX, clientY: event.clientY };
    updateHud();
    if (state.pointer?.id === event.pointerId) {
      const distance = Math.hypot(event.clientX - state.pointer.startX, event.clientY - state.pointer.startY);
      if (!state.pointer.drag && distance > 5) {
        state.pointer.drag = true;
        el.viewport.setPointerCapture(event.pointerId);
        el.viewport.classList.add("dragging");
        hideTooltip();
      }
      if (state.pointer.drag) {
        state.view.x += event.clientX - state.pointer.lastX;
        state.view.y += event.clientY - state.pointer.lastY;
        applyView();
      }
      state.pointer.lastX = event.clientX;
      state.pointer.lastY = event.clientY;
      return;
    }
    setHover(hitBuilding(event.clientX, event.clientY), event);
  };
  el.viewport.onpointerup = event => {
    const pointer = state.pointer;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.pressed) buildingElements.get(pointer.pressed)?.classList.remove("pressed");
    if (pointer.drag) {
      try { el.viewport.releasePointerCapture(event.pointerId); } catch {}
      el.viewport.classList.remove("dragging");
    } else {
      const hit = hitBuilding(event.clientX, event.clientY);
      if (hit) openBuilding(hit);
    }
    state.pointer = null;
  };
  el.viewport.onpointercancel = () => { state.pointer = null; el.viewport.classList.remove("dragging"); };
  el.viewport.onpointerleave = () => { if (!state.pointer) setHover(null); state.cursor = null; updateHud(); };
  el.viewport.addEventListener("wheel", event => {
    event.preventDefault();
    state.cursor = { clientX: event.clientX, clientY: event.clientY };
    zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
  }, { passive: false });

  function applyView() { el.scene.style.transform = `translate(${state.view.x}px,${state.view.y}px) scale(${state.view.scale})`; updateHud(); }
  function fit() {
    const rect = el.viewport.getBoundingClientRect();
    const scale = Math.min(rect.width / t.imageWidth, rect.height / t.imageHeight) * .94;
    state.view = { scale, x: (rect.width - t.imageWidth * scale) / 2, y: (rect.height - t.imageHeight * scale) / 2 };
    state.initial = { ...state.view };
    applyView();
  }
  function zoomAt(factor, clientX, clientY) {
    const rect = el.viewport.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    const next = Math.max(.35, Math.min(8, state.view.scale * factor));
    const worldX = (x - state.view.x) / state.view.scale, worldY = (y - state.view.y) / state.view.scale;
    state.view = { scale: next, x: x - worldX * next, y: y - worldY * next };
    applyView();
  }
  function selectMap(buildingId, stallId = null) {
    if (state.selectedBuilding) buildingElements.get(state.selectedBuilding)?.classList.remove("selected");
    if (state.selectedStall) stallElements.get(state.selectedStall)?.classList.remove("highlighted");
    state.selectedBuilding = buildingId;
    state.selectedStall = stallId;
    if (buildingId) buildingElements.get(buildingId)?.classList.add("selected");
    if (stallId) stallElements.get(stallId)?.classList.add("highlighted");
  }

  function ownerVisual(owner, large = false) {
    const size = large ? " large" : "";
    if (owner.type === "PLAYER") return `<span class="owner-image player-head${size}" aria-label="Minecraft player head"><img src="${assetBase}player-head-base.svg" alt=""><img class="skin-overlay" src="${assetBase}player-head-overlay.svg" alt=""></span>`;
    if (owner.type === "GUILD") return `<span class="owner-image${size}"><img src="${assetBase}guild-banner.svg" alt="Guild banner"></span>`;
    return `<span class="owner-image${size}"><img src="${assetBase}unowned-stall.svg" alt="Unowned stall"></span>`;
  }
  const ownerType = owner => owner.type === "PLAYER" ? "Player" : owner.type === "GUILD" ? "Guild" : "Unowned";
  function locationMarkup(location, compact = false) {
    if (!location) return `<span class="coordinates unavailable">Coordinates unavailable</span>`;
    const value = `X ${location.x}, Y ${location.y}, Z ${location.z}`;
    return `<span class="coordinates${compact ? " compact" : ""}"><span>${value}</span><button class="copy-coordinates" data-copy="${location.x} ${location.y} ${location.z}" aria-label="Copy coordinates ${value}">Copy</button></span>`;
  }
  async function copyText(value, button) {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const input = document.createElement("textarea"); input.value = value; input.style.position = "fixed"; input.style.opacity = "0";
      document.body.append(input); input.select(); document.execCommand("copy"); input.remove();
    }
    const previous = button.textContent; button.textContent = "Copied"; setTimeout(() => button.textContent = previous, 1000);
  }
  function bindCopy(root = document) {
    root.querySelectorAll(".copy-coordinates").forEach(button => button.onclick = event => { event.stopPropagation(); copyText(button.dataset.copy, button); });
  }

  function rentState(nextRentAt) {
    if (!nextRentAt) return { className: "unavailable", text: "Rent time unavailable" };
    const milliseconds = new Date(nextRentAt).getTime() - Date.now();
    if (!Number.isFinite(milliseconds)) return { className: "unavailable", text: "Rent time unavailable" };
    if (milliseconds <= 0) return { className: "expired", text: "Expired" };
    const hours = milliseconds / 3600000, days = Math.floor(hours / 24), remainingHours = Math.floor(hours % 24), minutes = Math.max(0, Math.floor((milliseconds % 3600000) / 60000));
    return { className: hours < 24 ? "urgent" : hours < 72 ? "warning" : "healthy", text: days ? `${days}d ${remainingHours}h` : `${Math.floor(hours)}h ${minutes}m` };
  }
  function rentMarkup(nextRentAt) { const rent = rentState(nextRentAt); return `<strong class="rent-countdown ${rent.className}" data-next-rent="${esc(nextRentAt || "")}">${rent.text}</strong>`; }
  function refreshRentCountdowns() {
    document.querySelectorAll("[data-next-rent]").forEach(node => { const rent = rentState(node.dataset.nextRent || null); node.className = `rent-countdown ${rent.className}`; node.textContent = rent.text; });
  }
  setInterval(refreshRentCountdowns, 60000);

  function itemMetadata(item) {
    const metadata = item.metadata || {}, details = [];
    const levelName = level => ({ 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X" })[level] || level;
    if (metadata.customName && metadata.customName !== item.displayName) details.push(`Named “${metadata.customName}”`);
    if (metadata.enchantments?.length) details.push(...metadata.enchantments.map(enchantment => `${enchantment.displayName} ${levelName(enchantment.level)}`));
    if (metadata.storedEnchantments?.length) details.push(...metadata.storedEnchantments.map(enchantment => `${enchantment.displayName} ${levelName(enchantment.level)}`));
    if (metadata.armorTrim) details.push(`${metadata.armorTrim.material} ${metadata.armorTrim.pattern} Armor Trim`);
    if (metadata.potion) {
      if (metadata.potion.basePotion) details.push(metadata.potion.basePotion);
      details.push(...(metadata.potion.effects || []).map(effect => `${effect.name} ${effect.amplifier + 1} · ${effect.durationSeconds}s`));
    }
    if (metadata.smithingTemplate) details.push(`${metadata.smithingTemplate.type} Smithing Template`);
    if (metadata.shulkerColor) details.push(`${metadata.shulkerColor} Shulker Box`);
    if (metadata.writtenBook) details.push(`“${metadata.writtenBook.title}” by ${metadata.writtenBook.author}`, `${metadata.writtenBook.generation} · ${metadata.writtenBook.pageCount} pages`);
    if (metadata.goatHornInstrument) details.push(metadata.goatHornInstrument);
    if (metadata.dyedColor) details.push(`Dyed ${metadata.dyedColor}`);
    if (metadata.fireworkEffects?.length) details.push(...metadata.fireworkEffects.map(effect => effect.description || effect.type));
    if (metadata.bannerPatterns?.length) details.push(...metadata.bannerPatterns.map(pattern => `${pattern.color} ${pattern.pattern}`));
    if (metadata.publicVariantId) details.push(metadata.publicVariantId);
    return details.filter(Boolean);
  }
  function transactionLabels(direction) { return direction === "BUY" ? ["YOU PROVIDE", "YOU RECEIVE"] : direction === "TRADE" ? ["YOU RECEIVE", "YOU GIVE"] : ["YOU RECEIVE", "YOU PAY"]; }
  function iconDefinition(item) {
    const definition = iconManifest.materials[item.material] || iconManifest.fallback;
    const layers = [...definition.layers];
    const trim = item.metadata?.armorTrim?.material;
    if (trim && definition.variants?.armorTrim?.[trim]) layers.push(...definition.variants.armorTrim[trim]);
    return layers;
  }
  function itemIcon(item, extraClass = "") {
    const layers = iconDefinition(item).map((layer, index) => {
      const source = `${assetBase}${layer.src}`;
      if (layer.tint || layer.tintSource) {
        const tint = layer.tint || item.metadata?.potion?.color || layer.defaultTint;
        return `<span class="item-texture tint-layer" style="--item-mask:url('${cssAssetBase}${layer.src}');--item-tint:${esc(tint)}" aria-hidden="true"></span>`;
      }
      return `<img class="item-texture layer-${index}" src="${source}" alt="" draggable="false">`;
    }).join("");
    return `<span class="minecraft-item-icon ${extraClass}" role="img" aria-label="${esc(item.displayName)}">${layers}</span>`;
  }
  function itemPanel(item, label, shopId, side) {
    return `<button class="transaction-side" data-inspect-shop="${shopId}" data-inspect-side="${side}" aria-label="Inspect ${esc(label.toLowerCase())}: ${esc(item.displayName)}"><span class="transaction-label">${label}</span><span class="transaction-item">${itemIcon(item)}<span class="item-copy"><strong>${item.amount}× ${esc(item.displayName)}</strong></span></span></button>`;
  }

  function openBuilding(building) {
    closeInspector(); selectMap(building.id);
    if (building.stallIds.length === 1) return openStall(adapter.getStall(building.stallIds[0]), null);
    state.drawerBuilding = building; state.drawerMode = "building"; renderBuildingDrawer(); showDrawer();
  }
  function showDrawer() { el.drawer.hidden = false; el.backdrop.hidden = false; requestAnimationFrame(() => $("#drawer-close").focus()); }
  function closeDrawer() { closeInspector(); el.drawer.hidden = true; el.backdrop.hidden = true; state.drawerMode = null; state.drawerBuilding = null; state.highlightShop = null; selectMap(null); }
  function renderBuildingDrawer() {
    const building = state.drawerBuilding;
    const totalShops = building.stallIds.reduce((sum, id) => sum + (adapter.getStall(id)?.shops.length || 0), 0);
    const multipleFloors = building.floors.length > 1;
    el.kicker.textContent = "Market building"; el.title.textContent = building.label; el.summary.textContent = `${building.stallIds.length} stalls · ${totalShops} shops`; el.back.hidden = true;
    el.content.innerHTML = `<div class="building-stall-groups">${[...building.floors].sort((a, b) => a.index - b.index).map(floor => `<section class="stall-group">${multipleFloors ? `<h3>${esc(floor.name)}</h3>` : ""}<div class="stall-card-list">${[...floor.stallIds].sort(C.naturalCompare).map(id => stallCard(adapter.getStall(id))).join("")}</div></section>`).join("")}</div>`;
    el.content.querySelectorAll("[data-stall]").forEach(node => node.onclick = () => openStall(adapter.getStall(node.dataset.stall), building));
  }
  function stallCard(stall) {
    const stock = stall.shops.reduce((sum, shop) => sum + shop.stockCount, 0);
    const categories = [...new Set(stall.shops.map(shop => ({ SELL: "Selling", BUY: "Buying", TRADE: "Trading" })[shop.direction]))].join(" · ") || "No shops listed";
    return `<button class="stall-card" data-stall="${stall.id}">${ownerVisual(stall.owner)}<span class="stall-card-copy"><span class="stall-number">${displayStall(stall.id)}</span><strong>${esc(stall.owner.name)}</strong><small>${ownerType(stall.owner)} · ${stall.shops.length} shop${stall.shops.length === 1 ? "" : "s"}</small><small>${categories}</small></span><span class="stock-line">${stock > 0 ? "In stock" : "No stock"}</span></button>`;
  }
  function ownershipDuration(date) {
    if (!date) return "Not currently owned";
    const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
    if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
    const months = Math.floor(days / 30); return `${months} month${months === 1 ? "" : "s"}`;
  }
  function openStall(stall, fromBuilding = state.drawerBuilding, shopId = null) {
    if (!stall) return;
    closeInspector(); state.drawerMode = "stall";
    state.drawerBuilding = fromBuilding || layout.buildings.find(building => building.id === stall.buildingId);
    state.highlightShop = shopId; selectMap(stall.buildingId, stall.id);
    const building = layout.buildings.find(item => item.id === stall.buildingId), floor = building.floors.find(item => item.index === stall.floor);
    el.kicker.textContent = `${building.label} · ${floor?.name || C.floorName(stall.floor)}`; el.title.textContent = displayStall(stall.id);
    el.summary.textContent = stall.owner.type === "NONE" ? "Available market stall" : `${ownerType(stall.owner)} owned · ${stall.shops.length} shops`;
    el.back.hidden = !fromBuilding || building.stallIds.length === 1;
    const members = stall.members.length ? `<section class="member-list"><h3>Members</h3><p>${stall.members.map(esc).join(" · ")}</p></section>` : "";
    el.content.innerHTML = `<div class="stall-hero">${ownerVisual(stall.owner, true)}<div><p class="eyebrow">${stall.owner.type === "NONE" ? "Available" : "Current owner"}</p><h3>${esc(stall.owner.name)}</h3><p>${stall.ownerSince ? `Owned for ${ownershipDuration(stall.ownerSince)} · since ${new Date(stall.ownerSince).toLocaleDateString()}` : "Ready to rent"}</p></div></div>${locationMarkup(stall.location)}<div class="detail-grid"><div><small>Rent remaining</small>${rentMarkup(stall.nextRentAt)}</div><div><small>Members</small><strong>${stall.members.length}</strong></div><div><small>Shops</small><strong>${stall.shops.length}</strong></div></div>${members}<h3>Shops</h3><div class="shop-list">${stall.shops.length ? stall.shops.map(shop => shopCard(shop, shop.id === shopId)).join("") : `<div class="shop-card empty"><strong>This stall is ready for its next shop.</strong><small>Ownership and live shop data will appear here.</small></div>`}</div>`;
    showDrawer(); bindDrawerActions();
    if (shopId) requestAnimationFrame(() => el.content.querySelector(".shop-card.highlight")?.scrollIntoView({ block: "center" }));
  }
  function shopCard(shop, highlight) {
    const labels = transactionLabels(shop.direction), action = { SELL: "Selling", BUY: "Buying", TRADE: "Trading" }[shop.direction];
    return `<article class="shop-card${highlight ? " highlight" : ""}" data-shop="${shop.id}" tabindex="0" role="button" aria-label="Inspect ${action.toLowerCase()} shop by ${esc(shop.owner.name)}"><header><span class="direction">${action}</span><small>Shop by <strong title="${esc(shop.owner.name)}">${esc(shop.owner.name)}</strong></small></header><div class="transaction-grid">${itemPanel(shop.sellItem, labels[0], shop.id, "sellItem")}<span class="transaction-arrow" aria-hidden="true">⇄</span>${itemPanel(shop.costItem, labels[1], shop.id, "costItem")}</div><footer><span>${shop.stockCount} in stock · ${shop.availableTrades} trades available</span>${locationMarkup(shop.interaction, true)}</footer></article>`;
  }
  function bindDrawerActions() {
    bindCopy(el.content);
    el.content.querySelectorAll(".shop-card[data-shop]").forEach(card => {
      const openDefault = () => openInspector(Number(card.dataset.shop));
      card.onclick = event => { if (!event.target.closest("button")) openDefault(); };
      card.onkeydown = event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openDefault(); } };
    });
    el.content.querySelectorAll("[data-inspect-shop]").forEach(button => button.onclick = event => {
      event.stopPropagation(); openInspector(Number(button.dataset.inspectShop), button.dataset.inspectSide);
    });
    refreshRentCountdowns();
  }

  function inspectorEntry(shop, side, item, role, depth = 0, context = null) { return { shop, side, item, role, depth, context }; }
  function openInspector(shopId, side = null, match = null) {
    const shop = adapter.getShops().find(candidate => candidate.id === shopId);
    if (!shop) return;
    const selectedSide = side || (shop.direction === "BUY" ? "sellItem" : "sellItem");
    const labels = transactionLabels(shop.direction);
    state.inspectorHistory = [inspectorEntry(shop, selectedSide, shop[selectedSide], selectedSide === "sellItem" ? labels[0] : labels[1])];
    if (match?.contained && match.container) {
      const containerSide = match.side;
      const containerItem = shop[containerSide];
      state.inspectorHistory = [inspectorEntry(shop, containerSide, containerItem, containerSide === "sellItem" ? labels[0] : labels[1], 0, { focusMaterial: match.item.material })];
    }
    renderInspector();
  }
  function closeInspector() { el.inspector.hidden = true; state.inspectorHistory = []; document.body.classList.remove("inspector-open"); }
  function selectInspectorSide(shop, side) {
    const labels = transactionLabels(shop.direction);
    state.inspectorHistory = [inspectorEntry(shop, side, shop[side], side === "sellItem" ? labels[0] : labels[1])];
    renderInspector();
  }
  function inspectContained(item, context, depth) {
    if (depth > 4) return;
    const current = state.inspectorHistory.at(-1);
    state.inspectorHistory.push(inspectorEntry(current.shop, current.side, item, current.role, depth, context));
    renderInspector();
  }
  function inspectorItemDetails(item) {
    const metadata = itemMetadata(item);
    return `<section class="minecraft-tooltip"><div class="inspected-item">${itemIcon(item, "large")}<div><h3>${esc(item.metadata?.customName || item.displayName)}</h3>${item.metadata?.customName ? `<p>${esc(item.displayName)}</p>` : ""}<strong>${item.amount}×</strong></div></div>${metadata.length ? `<ul>${metadata.map(detail => `<li>${esc(detail)}</li>`).join("")}</ul>` : `<p>No additional public item details.</p>`}<code>minecraft:${esc(item.material.toLowerCase())}</code></section>`;
  }
  function containerMarkup(entry) {
    const { item, context, depth } = entry, container = item.metadata?.container;
    if (!container) return "";
    const note = `${entry.role === "YOU PROVIDE" || entry.role === "YOU GIVE" || entry.role === "YOU PAY" ? "Provided" : "Sold"} as one ${item.displayName}. Contents are not separate listings.`;
    if (container.type === "SHULKER") {
      const slots = new Map(container.contents.map(value => [value.slot, value.item]));
      return `<section class="container-inspection"><h3>${esc(item.displayName)} contents</h3><p>${esc(note)}</p><div class="minecraft-shulker-window" style="--shulker-gui:url('${cssAssetBase}${iconManifest.gui.shulker}')"><div class="shulker-slot-grid">${Array.from({ length: 27 }, (_, slot) => {
        const child = slots.get(slot), focused = child && context?.focusMaterial === child.material;
        return `<button class="minecraft-slot${focused ? " focused-match" : ""}" style="--slot-image:url('${cssAssetBase}${iconManifest.gui.slot}')" data-container-slot="${slot}" ${child ? "" : "disabled"} aria-label="${child ? `${child.amount} ${esc(child.displayName)}` : "Empty slot"}">${child ? `${itemIcon(child)}<span class="stack-count">${child.amount}</span><span class="slot-tooltip"><strong>${esc(child.displayName)}</strong>${itemMetadata(child).map(detail => `<small>${esc(detail)}</small>`).join("")}</span>` : ""}</button>`;
      }).join("")}</div></div></section>`;
    }
    const maximum = Math.max(1, container.capacityMax || 64), used = Math.max(0, container.capacityUsed || 0);
    return `<section class="container-inspection bundle-inspection"><h3>${esc(item.displayName)} contents</h3><p>${esc(note)}</p><div class="bundle-meter" aria-label="${used} of ${maximum} bundle capacity used"><span style="width:${Math.min(100, used / maximum * 100)}%"></span></div><p>${used} used · ${Math.max(0, maximum - used)} remaining</p><div class="bundle-items">${container.contents.map((value, index) => { const child = value.item, focused = context?.focusMaterial === child.material; return `<button class="bundle-item${focused ? " focused-match" : ""}" data-container-index="${index}">${itemIcon(child)}<span><strong>${child.amount}× ${esc(child.displayName)}</strong><small>${itemMetadata(child).join(" · ") || "Bundle item"}</small></span></button>`; }).join("")}</div></section>`;
  }
  function renderInspector() {
    const entry = state.inspectorHistory.at(-1), { shop, item } = entry;
    const labels = transactionLabels(shop.direction), action = { SELL: "Selling", BUY: "Buying", TRADE: "Trading" }[shop.direction];
    el.inspector.hidden = false; document.body.classList.add("inspector-open");
    el.inspectorKicker.textContent = `${action} · ${entry.role}`; el.inspectorTitle.textContent = item.displayName;
    el.inspectorContent.innerHTML = `${state.inspectorHistory.length > 1 ? `<button class="inspector-back" type="button">← Back to ${esc(state.inspectorHistory.at(-2).item.displayName)}</button>` : ""}<section class="inspector-shop-context"><span>Shop by <strong>${esc(shop.owner.name)}</strong></span>${locationMarkup(shop.interaction, true)}</section><div class="inspector-transaction-tabs"><button class="${entry.side === "sellItem" && state.inspectorHistory.length === 1 ? "active" : ""}" data-inspector-side="sellItem"><span class="transaction-tab-label">${labels[0]}</span>${itemIcon(shop.sellItem)}<strong>${shop.sellItem.amount}× ${esc(shop.sellItem.displayName)}</strong></button><button class="${entry.side === "costItem" && state.inspectorHistory.length === 1 ? "active" : ""}" data-inspector-side="costItem"><span class="transaction-tab-label">${labels[1]}</span>${itemIcon(shop.costItem)}<strong>${shop.costItem.amount}× ${esc(shop.costItem.displayName)}</strong></button></div>${inspectorItemDetails(item)}${containerMarkup(entry)}`;
    bindCopy(el.inspectorContent);
    el.inspectorContent.querySelectorAll("[data-inspector-side]").forEach(button => button.onclick = () => selectInspectorSide(shop, button.dataset.inspectorSide));
    el.inspectorContent.querySelector(".inspector-back")?.addEventListener("click", () => { state.inspectorHistory.pop(); renderInspector(); });
    const container = item.metadata?.container;
    el.inspectorContent.querySelectorAll("[data-container-slot]").forEach(button => button.onclick = () => {
      const child = container.contents.find(value => value.slot === Number(button.dataset.containerSlot))?.item;
      if (child) inspectContained(child, null, entry.depth + 1);
    });
    el.inspectorContent.querySelectorAll("[data-container-index]").forEach(button => {
      button.onclick = () => inspectContained(container.contents[Number(button.dataset.containerIndex)].item, null, entry.depth + 1);
    });
    requestAnimationFrame(() => el.inspectorContent.querySelector(".focused-match")?.scrollIntoView({ block: "center" }));
  }

  function matchesFilters(stall) {
    const filter = state.filters;
    const haystack = [stall.id, stall.owner.name, ...stall.shops.flatMap(shop => [shop.owner.name, ...window.EnthusiaMarketAdapter.containerEntries(shop.sellItem, "sellItem").flatMap(entry => window.EnthusiaMarketAdapter.itemTerms(entry.item)), ...window.EnthusiaMarketAdapter.containerEntries(shop.costItem, "costItem").flatMap(entry => window.EnthusiaMarketAdapter.itemTerms(entry.item))])].join(" ").toLowerCase();
    return (!filter.text || haystack.includes(filter.text.toLowerCase())) && (filter.floor === "ALL" || stall.floor === Number(filter.floor)) && (filter.owner === "ALL" || stall.owner.type === filter.owner) && (filter.shop === "ALL" || stall.shops.some(shop => shop.direction === filter.shop)) && (filter.stock === "ALL" || stall.shops.some(shop => filter.stock === "IN" ? shop.stockCount > 0 : shop.stockCount <= 0));
  }
  function applyFilters() {
    state.matching = new Set(snapshot.stalls.filter(matchesFilters).map(stall => stall.id));
    for (const stall of layout.stalls) stallElements.get(stall.id).classList.toggle("filtered", !state.matching.has(stall.id));
    for (const building of layout.buildings) buildingElements.get(building.id).classList.toggle("filtered", !building.stallIds.some(id => state.matching.has(id)));
    $("#result-count").textContent = `${state.matching.size} of ${layout.stalls.length} stalls`;
    const labels = { text: "Search", floor: "Floor", owner: "Owner", shop: "Shop", stock: "Stock" };
    $("#filter-chips").innerHTML = Object.entries(state.filters).filter(([, value]) => value && value !== "ALL").map(([key, value]) => `<span class="chip">${labels[key]}: ${esc(value)}</span>`).join("");
  }
  function clearFilters() {
    state.filters = { text: "", floor: "ALL", owner: "ALL", shop: "ALL", stock: "ALL" };
    $("#market-filter-search").value = ""; $("#floor-filter").value = $("#owner-filter").value = $("#shop-filter").value = $("#stock-filter").value = "ALL"; applyFilters();
  }
  for (const floor of [...new Set(layout.stalls.map(stall => stall.floor))].sort((a, b) => a - b)) {
    const option = document.createElement("option"); option.value = floor; option.textContent = C.floorName(floor); $("#floor-filter").append(option);
  }
  for (const [selector, key] of [["#market-filter-search", "text"], ["#floor-filter", "floor"], ["#owner-filter", "owner"], ["#shop-filter", "shop"], ["#stock-filter", "stock"]]) {
    $(selector).addEventListener(selector.includes("search") ? "input" : "change", event => { state.filters[key] = event.target.value; applyFilters(); });
  }
  $("#clear-filters").onclick = clearFilters;
  $("#mobile-filters").onclick = () => { const open = filterFields.classList.toggle("open"); $("#mobile-filters").setAttribute("aria-expanded", open); };

  function executeSearch(query = $("#item-search").value) {
    const value = query.trim(), shops = adapter.searchItems(value);
    if (value) {
      const recent = JSON.parse(localStorage.getItem("enthusia-market-recent-searches") || "[]").filter(item => item !== value);
      localStorage.setItem("enthusia-market-recent-searches", JSON.stringify([value, ...recent].slice(0, 6)));
    }
    renderResults(value, shops); hideSuggestions(); return shops;
  }
  function renderResults(query, shops) {
    if (!query) { el.results.innerHTML = `<div class="empty-results"><h2>Browse the whole market</h2><p>Search for an item or select any building on the map.</p></div>`; return; }
    el.results.innerHTML = `<p class="eyebrow">Item results</p><h2>${shops.length} result${shops.length === 1 ? "" : "s"} for “${esc(query)}”</h2><div class="result-list">${shops.map((shop, index) => {
      const item = shop.match.item;
      const contained = shop.match.contained ? `<small class="contained-match">${item.amount}× inside ${esc(shop.match.container.displayName)} · container contents are not sold separately</small>` : "";
      return `<article class="result-card"><button class="result-main" data-result-index="${index}">${itemIcon(item)}<span><strong>${esc(item.displayName)}</strong>${contained}<small>${{ SELL: "Selling", BUY: "Buying", TRADE: "Trading" }[shop.direction]} · ${displayStall(shop.stall.id)}</small><small>${C.floorName(shop.stall.floor)}</small></span></button>${locationMarkup(shop.interaction, true)}</article>`;
    }).join("")}</div>`;
    el.results.querySelectorAll("[data-result-index]").forEach(button => button.onclick = () => {
      const shop = shops[Number(button.dataset.resultIndex)], stall = shop.stall;
      clearFilters(); focusBuilding(stall.buildingId); openStall(stall, null, shop.id); openInspector(shop.id, shop.match.side, shop.match);
    });
    bindCopy(el.results);
  }
  function focusBuilding(id) {
    const building = layout.buildings.find(item => item.id === id), point = px(building.labelPoint), rect = el.viewport.getBoundingClientRect(), scale = Math.max(state.view.scale, 2);
    state.view = { scale, x: rect.width / 2 - point.x * scale, y: rect.height / 2 - point.y * scale }; applyView(); selectMap(id);
  }
  function showSuggestions() {
    const input = $("#item-search"), items = input.value.trim() ? adapter.suggest(input.value) : JSON.parse(localStorage.getItem("enthusia-market-recent-searches") || "[]");
    state.suggestionIndex = -1; const box = $("#search-suggestions");
    if (!items.length) { box.hidden = true; return; }
    box.innerHTML = items.map((item, index) => `<button role="option" data-suggestion="${esc(item)}" data-index="${index}">${esc(item)}</button>`).join(""); box.hidden = false;
    box.querySelectorAll("button").forEach(button => button.onclick = () => { $("#item-search").value = button.dataset.suggestion; executeSearch(); });
  }
  function hideSuggestions() { $("#search-suggestions").hidden = true; state.suggestionIndex = -1; }
  $("#item-search").oninput = showSuggestions; $("#item-search").onfocus = showSuggestions;
  $("#item-search").onkeydown = event => {
    const buttons = [...$("#search-suggestions").querySelectorAll("button")];
    if (event.key === "ArrowDown" && buttons.length) { event.preventDefault(); state.suggestionIndex = Math.min(buttons.length - 1, state.suggestionIndex + 1); }
    else if (event.key === "ArrowUp" && buttons.length) { event.preventDefault(); state.suggestionIndex = Math.max(0, state.suggestionIndex - 1); }
    else if (event.key === "Enter") { event.preventDefault(); if (state.suggestionIndex >= 0) $("#item-search").value = buttons[state.suggestionIndex].dataset.suggestion; executeSearch(); }
    else if (event.key === "Escape") hideSuggestions();
    buttons.forEach((button, index) => button.classList.toggle("active", index === state.suggestionIndex));
  };
  $("#search-button").onclick = () => executeSearch(); $("#drawer-close").onclick = closeDrawer; el.backdrop.onclick = closeDrawer;
  el.back.onclick = () => { closeInspector(); if (state.drawerBuilding) { state.drawerMode = "building"; renderBuildingDrawer(); } };
  $("#inspector-close").onclick = closeInspector;
  $("#zoom-in").onclick = () => zoomAt(1.2, el.viewport.getBoundingClientRect().left + el.viewport.clientWidth / 2, el.viewport.getBoundingClientRect().top + el.viewport.clientHeight / 2);
  $("#zoom-out").onclick = () => zoomAt(.83, el.viewport.getBoundingClientRect().left + el.viewport.clientWidth / 2, el.viewport.getBoundingClientRect().top + el.viewport.clientHeight / 2);
  $("#fit-map").onclick = fit;
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!el.inspector.hidden) {
      if (state.inspectorHistory.length > 1) { state.inspectorHistory.pop(); renderInspector(); } else closeInspector();
    } else if (!el.drawer.hidden) closeDrawer(); else hideSuggestions();
  });
  window.addEventListener("resize", () => requestAnimationFrame(fit));

  window.__MARKET_TEST__ = {
    layout, snapshot, adapter, hitBuilding, screenWorld, openBuilding, openStall, openInspector, closeInspector, closeDrawer,
    executeSearch, applyFilters, clearFilters, focusBuilding, rentState, transactionLabels, itemMetadata, itemIcon,
    get state() { return state; }, counts: { buildings: layout.buildings.length, stalls: layout.stalls.length }, drawerMode: () => state.drawerMode
  };
  initMap(); applyFilters(); requestAnimationFrame(fit);
})();
