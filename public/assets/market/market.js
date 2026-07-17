(async function () {
  "use strict";

  const C = window.EnthusiaMapCore;
  const layout = window.ENTHUSIA_MARKET_DATA.layout;
  let snapshot = null;
  const iconManifest = window.ENTHUSIA_MINECRAFT_ASSETS;
  const fontManifest = window.ENTHUSIA_MINECRAFT_FONT;
  const adapter = new window.EnthusiaMarketAdapter.StaticMarketAdapter(layout, null);
  const $ = selector => document.querySelector(selector);
  const ns = "http://www.w3.org/2000/svg";
  const t = layout.renderTransform;
  const assetBase = document.querySelector("[data-market-asset-base]")?.dataset.marketAssetBase || $("#site-logo").getAttribute("src").replace(/[^/]+$/, "");
  const cssAssetBase = document.querySelector("[data-market-css-asset-base]")?.dataset.marketCssAssetBase ?? assetBase;
  const el = {
    viewport: $("#market-map"), scene: $("#map-scene"), svg: $("#map-svg"), buildings: $("#building-layer"),
    stalls: $("#stall-layer"), tooltip: $("#map-tooltip"), hud: $("#coordinate-hud"), hudValue: $("#coordinate-value"), clearCoordinate: $("#clear-coordinate"), marker: $("#pinned-coordinate-marker"), results: $("#search-results"), resultsContent: $(".search-results-content"),
    drawer: $("#market-drawer"), backdrop: $("#drawer-backdrop"), content: $("#drawer-content"), title: $("#drawer-title"),
    kicker: $("#drawer-kicker"), summary: $("#drawer-summary"), back: $("#drawer-back"), inspector: $("#item-inspector"),
    inspectorContent: $("#inspector-content"), inspectorTitle: $("#inspector-title"), inspectorKicker: $("#inspector-kicker"),
    itemTooltip: $("#minecraft-hover-tooltip"), connection: $("#market-connection-status"),
    connectionLabel: $("#market-connection-label"), lastUpdated: $("#market-last-updated")
  };

  const filterFields = $("#filter-fields");
  document.documentElement.classList.add("market-viewer-active");
  const overlayPortal = document.createElement("div");
  overlayPortal.className = "market-page-root market-overlay-portal";
  document.body.append(overlayPortal);
  for (const overlay of [el.backdrop, el.drawer, el.inspector, el.itemTooltip]) {
    if (overlay?.parentElement !== overlayPortal) overlayPortal.append(overlay);
  }
  el.scene.style.width = `${t.imageWidth}px`;
  el.scene.style.height = `${t.imageHeight}px`;
  el.svg.setAttribute("viewBox", `0 0 ${t.imageWidth} ${t.imageHeight}`);

  const state = {
    view: { scale: 1, x: 0, y: 0 }, initial: null, pointer: null, cursor: null, hovered: null,
    selectedBuilding: null, selectedStall: null, drawerMode: null, drawerBuilding: null, highlightShop: null,
    inspectorHistory: [], filters: { floor: "ALL", owner: "ALL", shop: "ALL", stock: "ALL", rent: "ALL" },
    matching: new Set(layout.stalls.map(stall => stall.id)), suggestionIndex: -1, mobileStack: [], mobileResultsOpen: false, searchReturn: false, lastSearch: null,
    pinned: null, touchPointers: new Map(), touchTap: null, touchGesture: null, collapsedContext: null,
    sheet: {type: null, state: "hidden", previous: "normal", surface: null, returnFocus: null, gesture: null}
  };
  let connectionStatus = {state: "connecting", source: "unavailable", updatedAt: null};
  const buildingElements = new Map();
  const stallElements = new Map();
  const px = point => ({ x: (point.x - t.originX) * t.pixelsPerBlock, y: (point.z - t.originZ) * t.pixelsPerBlock });
  const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const displayStall = id => `Stall ${String(id).match(/\d+/)?.[0] || id}`;
  const buildingNumber = id => `Building ${String(id).match(/\d+/)?.[0] || id}`;
  const isMobile = () => matchMedia("(max-width: 600px), (max-height: 500px)").matches;
  const makeSvg = (name, attributes = {}) => {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };

  function updateViewportMetrics() {
    const header = document.querySelector(".site-header"), footer = document.querySelector(".market-footer");
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0, viewportHeight = viewport?.height || innerHeight, viewportBottom = viewportTop + viewportHeight;
    const headerBottom = header?.getBoundingClientRect().bottom || 0;
    const visibleHeaderBottom = Math.max(0, Math.min(viewportHeight, headerBottom - viewportTop));
    document.documentElement.style.setProperty("--visible-header-bottom", `${visibleHeaderBottom}px`);
    const footerRect = footer?.getBoundingClientRect();
    const overlap = footerRect ? Math.max(0, viewportBottom - Math.max(viewportTop, footerRect.top)) : 0;
    document.documentElement.style.setProperty("--visible-footer-overlap", `${Math.min(overlap, viewport?.height || innerHeight)}px`);
    const contextHeight = isMobile() && state.collapsedContext ? state.collapsedContext.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty("--collapsed-context-height", `${contextHeight}px`);
  }
  const viewportObserver = new ResizeObserver(() => requestAnimationFrame(updateViewportMetrics));
  viewportObserver.observe(document.querySelector(".site-header"));
  viewportObserver.observe(document.querySelector(".market-footer"));
  const headerObserver = new MutationObserver(() => requestAnimationFrame(updateViewportMetrics));
  headerObserver.observe(document.querySelector(".site-header"), {attributes:true, attributeFilter:["class","style"]});
  document.querySelector(".site-header").addEventListener("transitionrun", () => { const track = () => { updateViewportMetrics(); if (document.getAnimations().some(animation => animation.playState === "running")) requestAnimationFrame(track); }; track(); });
  addEventListener("scroll", updateViewportMetrics, {passive: true});
  addEventListener("resize", updateViewportMetrics, {passive: true});
  visualViewport?.addEventListener("resize", updateViewportMetrics, {passive: true});
  visualViewport?.addEventListener("scroll", updateViewportMetrics, {passive: true});

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
    const point = pointer ? screenWorld(pointer.clientX, pointer.clientY) : state.pinned;
    if (!point) { el.hudValue.textContent = "X — · Z —"; el.clearCoordinate.hidden = true; return; }
    const pinned = !pointer || isMobile();
    const value = pinned && state.pinned ? state.pinned : point;
    el.hudValue.textContent = pinned ? `X ${Math.round(value.x)} · Z ${Math.round(value.z)}` : `X ${value.x.toFixed(1)} · Z ${value.z.toFixed(1)}`;
    el.clearCoordinate.hidden = !state.pinned;
  }
  function pinCoordinate(clientX, clientY) {
    const world = screenWorld(clientX, clientY);
    state.pinned = {x: Math.round(world.x), z: Math.round(world.z)};
    const point = px(state.pinned); el.marker.hidden = !isMobile(); el.marker.setAttribute("transform", `translate(${point.x} ${point.y})`);
    updateHud(null);
  }
  function clearPinnedCoordinate() { state.pinned = null; el.marker.hidden = true; state.cursor = null; updateHud(null); }
  function setHover(building, event) {
    if (state.hovered !== building?.id) {
      if (state.hovered) buildingElements.get(state.hovered)?.classList.remove("hovered");
      state.hovered = building?.id || null;
      if (building) buildingElements.get(building.id)?.classList.add("hovered");
    }
    if (building && event) showTooltip(building, event.clientX, event.clientY);
    else if (!building) hideTooltip();
  }

  const touchMidpoint = () => { const points = [...state.touchPointers.values()].slice(0, 2); return {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)}; };
  function beginTouchGesture() {
    const midpoint = touchMidpoint(), rect = el.viewport.getBoundingClientRect(), localX = midpoint.x - rect.left, localY = midpoint.y - rect.top;
    state.touchGesture = {start: midpoint, view: {...state.view}, sceneX: (localX - state.view.x) / state.view.scale, sceneY: (localY - state.view.y) / state.view.scale};
    state.touchTap = null; hideTooltip(); el.viewport.classList.add("dragging");
    for (const id of state.touchPointers.keys()) try { el.viewport.setPointerCapture(id); } catch {}
  }
  function updateTouchGesture(event) {
    if (!state.touchGesture || state.touchPointers.size < 2) return;
    event.preventDefault(); const midpoint = touchMidpoint(), rect = el.viewport.getBoundingClientRect(), gesture = state.touchGesture;
    const scale = Math.max(.35, Math.min(8, gesture.view.scale * midpoint.distance / Math.max(1, gesture.start.distance)));
    const localX = midpoint.x - rect.left, localY = midpoint.y - rect.top;
    state.view = {scale, x: localX - gesture.sceneX * scale, y: localY - gesture.sceneY * scale}; applyView();
  }
  function finishTouch(event, cancelled = false) {
    const point = state.touchPointers.get(event.pointerId); state.touchPointers.delete(event.pointerId);
    if (state.touchGesture) {
      if (state.touchPointers.size < 2) { state.touchGesture = null; el.viewport.classList.remove("dragging"); }
      return;
    }
    if (!cancelled && point && state.touchTap?.id === event.pointerId && Math.hypot(point.x - state.touchTap.startX, point.y - state.touchTap.startY) <= 6) {
      pinCoordinate(event.clientX, event.clientY); const hit = hitBuilding(event.clientX, event.clientY); if (hit) openBuilding(hit);
    }
    state.touchTap = null;
  }
  el.viewport.onpointerdown = event => {
    if (event.pointerType === "touch") {
      if (event.isPrimary && state.touchPointers.size) { state.touchPointers.clear(); state.touchGesture = null; state.touchTap = null; }
      state.touchPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
      if (state.touchPointers.size === 1) state.touchTap = {id: event.pointerId, startX: event.clientX, startY: event.clientY};
      else if (state.touchPointers.size === 2) { event.preventDefault(); beginTouchGesture(); }
      return;
    }
    state.cursor = {clientX: event.clientX, clientY: event.clientY}; updateHud();
    if (event.button !== 0) return;
    const hit = hitBuilding(event.clientX, event.clientY);
    state.pointer = {id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, drag: false, pressed: hit?.id || null};
    if (hit) buildingElements.get(hit.id)?.classList.add("pressed");
  };
  el.viewport.onpointermove = event => {
    if (event.pointerType === "touch") {
      const point = state.touchPointers.get(event.pointerId); if (!point) return;
      point.x = event.clientX; point.y = event.clientY;
      if (state.touchTap && Math.hypot(point.x - state.touchTap.startX, point.y - state.touchTap.startY) > 6) state.touchTap = null;
      updateTouchGesture(event); return;
    }
    state.cursor = {clientX: event.clientX, clientY: event.clientY}; updateHud();
    if (state.pointer?.id === event.pointerId) {
      const distance = Math.hypot(event.clientX - state.pointer.startX, event.clientY - state.pointer.startY);
      if (!state.pointer.drag && distance > 5) { state.pointer.drag = true; el.viewport.setPointerCapture(event.pointerId); el.viewport.classList.add("dragging"); hideTooltip(); }
      if (state.pointer.drag) { state.view.x += event.clientX - state.pointer.lastX; state.view.y += event.clientY - state.pointer.lastY; applyView(); }
      state.pointer.lastX = event.clientX; state.pointer.lastY = event.clientY; return;
    }
    setHover(hitBuilding(event.clientX, event.clientY), event);
  };
  el.viewport.onpointerup = event => {
    if (event.pointerType === "touch") { finishTouch(event); return; }
    const pointer = state.pointer; if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.pressed) buildingElements.get(pointer.pressed)?.classList.remove("pressed");
    if (pointer.drag) { try { el.viewport.releasePointerCapture(event.pointerId); } catch {} el.viewport.classList.remove("dragging"); }
    else { pinCoordinate(event.clientX, event.clientY); const hit = hitBuilding(event.clientX, event.clientY); if (hit) openBuilding(hit); }
    state.pointer = null;
  };
  el.viewport.onpointercancel = event => { if (event.pointerType === "touch") finishTouch(event, true); else state.pointer = null; el.viewport.classList.remove("dragging"); };
  el.viewport.onpointerleave = event => { if (event.pointerType !== "touch" && !state.pointer) setHover(null); state.cursor = null; updateHud(null); };
  el.viewport.addEventListener("wheel", event => {
    event.preventDefault();
    state.cursor = { clientX: event.clientX, clientY: event.clientY };
    zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
  }, { passive: false });
  el.clearCoordinate.onclick = clearPinnedCoordinate;

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

  const minotarHeadUrlPattern = /^https:\/\/minotar\.net\/helm\/[A-Za-z0-9._%+-]+\/96\.png$/;
  const capturedHeadUrlPattern = /^https:\/\/market-api\.enthusia\.info\/v1\/player-heads\/[0-9a-f]{64}\.png$/;
  function ownerHeadUrl(owner) {
    const url = owner?.avatarUrl || "";
    return minotarHeadUrlPattern.test(url) || capturedHeadUrlPattern.test(url) ? url : null;
  }
  function genericPlayer(owner, size, headUrl = null) {
    const data = headUrl ? ` data-owner-head-url="${esc(headUrl)}" data-owner-head-name="${esc(owner.name)}" data-skin-source="${esc(owner.avatar?.source || "JAVA")}" data-outer-layer="${owner.avatar?.includesOuterLayer === true}"` : "";
    return `<span class="owner-image player-head fallback${size}" aria-label="Generic player icon for ${esc(owner.name)}"${data}><img src="${assetBase}player-head-base.svg" alt="Generic player icon for ${esc(owner.name)}" width="82" height="82" decoding="async"><img class="skin-overlay" src="${assetBase}player-head-overlay.svg" alt="" width="82" height="82" decoding="async"></span>`;
  }
  function ownerVisual(owner, large = false) {
    const size = large ? " large" : "", headUrl = ownerHeadUrl(owner);
    if (owner.avatar?.kind === "GUILD_BANNER" && owner.avatar.banner) return `<span class="owner-image guild-banner${size}" aria-label="Guild banner for ${esc(owner.name)}"><canvas width="20" height="40" role="img" aria-label="Guild banner for ${esc(owner.name)}" data-guild-banner="${esc(JSON.stringify(owner.avatar.banner))}"></canvas></span>`;
    if ((owner.type === "PLAYER" || owner.avatar?.kind === "MINECRAFT_HEAD") && headUrl) return genericPlayer(owner, size, headUrl);
    if (owner.type === "PLAYER") return genericPlayer(owner, size);
    if (owner.type === "GUILD") return "";
    return `<span class="owner-image${size}"><img src="${assetBase}unowned-stall.svg" alt="Unowned stall" width="82" height="82" decoding="async"></span>`;
  }
  const drawGuildBanner = (canvas, design) => window.EnthusiaGuildBannerRenderer?.draw(canvas, design) || Promise.reject(new Error("banner-renderer-unavailable"));
  function hydrateOwnerVisuals(root=document) {
    root.querySelectorAll("[data-owner-head-url]:not([data-head-loading])").forEach(node=>{
      node.dataset.headLoading="true"; const image=new Image(); image.className="resolved-head"; image.alt=`Minecraft head for ${node.dataset.ownerHeadName}`; image.width=82; image.height=82; image.decoding="async"; image.dataset.skinSource=node.dataset.skinSource; image.dataset.outerLayer=node.dataset.outerLayer;
      image.onload=()=>{node.replaceChildren(image);node.classList.remove("fallback");node.classList.add("resolved");node.setAttribute("aria-label",image.alt)};
      image.onerror=()=>{image.onload=image.onerror=null;node.removeAttribute("data-owner-head-url");node.dataset.headFailed="true"}; image.src=node.dataset.ownerHeadUrl;
    });
    root.querySelectorAll("canvas[data-guild-banner]:not([data-banner-loading])").forEach(canvas=>{canvas.dataset.bannerLoading="true";drawGuildBanner(canvas,JSON.parse(canvas.dataset.guildBanner)).then(()=>canvas.dataset.bannerRendered="true").catch(()=>canvas.closest(".owner-image")?.remove())});
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

  function remainingTime(milliseconds) {
    const hours = milliseconds / 3600000, days = Math.floor(hours / 24), remainingHours = Math.floor(hours % 24), minutes = Math.max(0, Math.floor((milliseconds % 3600000) / 60000));
    return days ? `${days}d ${remainingHours}h` : `${Math.floor(hours)}h ${minutes}m`;
  }
  function rentState(stall) {
    const state = stall.stallState || (stall.owner.type === "NONE" ? "UNOWNED" : "OWNED");
    if (state === "UNOWNED") return { className: "available", text: "Available to purchase" };
    if (["AUCTIONING", "RE_AUCTIONING"].includes(state)) return { className: "warning", text: "Auction active" };
    if (state === "EMERGENCY_AUCTIONING") return { className: "expired", text: "Emergency auction" };
    if (state === "GRACE") {
      if (!stall.graceEndsAt) return { className: "unavailable", text: "Overdue · grace deadline unavailable" };
      const milliseconds = new Date(stall.graceEndsAt).getTime() - Date.now();
      if (!Number.isFinite(milliseconds)) return { className: "unavailable", text: "Overdue · grace deadline unavailable" };
      if (milliseconds <= 0) return { className: "expired", text: "Grace period expired · awaiting processing" };
      return { className: "expired", text: `Overdue · grace ends in ${remainingTime(milliseconds)}` };
    }
    if (!stall.nextRentAt) return { className: "unavailable", text: "Rent time unavailable" };
    const milliseconds = new Date(stall.nextRentAt).getTime() - Date.now();
    if (!Number.isFinite(milliseconds)) return { className: "unavailable", text: "Rent time unavailable" };
    if (milliseconds <= 0) return { className: "expired", text: "Rent overdue · awaiting collection" };
    const hours = milliseconds / 3600000;
    return { className: hours < 24 ? "urgent" : hours < 72 ? "warning" : "healthy", text: `Rent due in ${remainingTime(milliseconds)}` };
  }
  function rentMarkup(stall) {
    const rent = rentState(stall);
    return `<strong class="rent-countdown ${rent.className}" data-stall-state="${esc(stall.stallState || "")}" data-owner-type="${esc(stall.owner.type)}" data-next-rent="${esc(stall.nextRentAt || "")}" data-grace-ends="${esc(stall.graceEndsAt || "")}">${rent.text}</strong>`;
  }
  function refreshRentCountdowns() {
    document.querySelectorAll("[data-stall-state]").forEach(node => {
      const rent = rentState({stallState: node.dataset.stallState, nextRentAt: node.dataset.nextRent || null, graceEndsAt: node.dataset.graceEnds || null, owner: {type: node.dataset.ownerType}});
      node.className = `rent-countdown ${rent.className}`; node.textContent = rent.text;
    });
  }
  setInterval(refreshRentCountdowns, 60000);

  function itemMetadata(item) {
    const metadata = item.metadata || {}, details = [];
    const levelName = level => ({ 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X" })[level] || level;
    const displayName = window.EnthusiaMarketAdapter.stripMinecraftFormatting(item.displayName);
    const customName = window.EnthusiaMarketAdapter.stripMinecraftFormatting(metadata.customName);
    if (customName && customName.localeCompare(displayName, undefined, {sensitivity: "base"}) !== 0) details.push(`Named “${customName}”`);
    if (metadata.enchantments?.length) details.push(...metadata.enchantments.map(window.EnthusiaMarketAdapter.enchantmentDisplay));
    if (metadata.storedEnchantments?.length) details.push(...metadata.storedEnchantments.map(window.EnthusiaMarketAdapter.enchantmentDisplay));
    if (metadata.armorTrim) details.push(`${metadata.armorTrim.material} ${metadata.armorTrim.pattern} Armor Trim`);
    if (metadata.potion) details.push(...(metadata.potion.effects || []).map(effect => `${effect.name}${effect.amplifier > 0 ? ` ${levelName(effect.amplifier + 1)}` : ""}${effect.durationSeconds > 0 ? ` · ${effect.durationSeconds}s` : ""}`));
    if (metadata.smithingTemplate) details.push(`${metadata.smithingTemplate.type} Smithing Template`);
    if (metadata.shulkerColor) details.push(`${metadata.shulkerColor} Shulker Box`);
    if (metadata.writtenBook) details.push(`“${metadata.writtenBook.title}” by ${metadata.writtenBook.author}`, `${metadata.writtenBook.generation} · ${metadata.writtenBook.pageCount} pages`);
    if (metadata.goatHornInstrument) details.push(metadata.goatHornInstrument);
    if (metadata.dyedColor) details.push(`Dyed ${metadata.dyedColor}`);
    if (metadata.fireworkEffects?.length) details.push(...metadata.fireworkEffects.map(effect => effect.description || effect.type));
    if (metadata.bannerPatterns?.length) details.push(...metadata.bannerPatterns.map(pattern => `${pattern.color} ${pattern.pattern}`));
    if (metadata.publicVariantId) details.push(metadata.publicVariantId);
    const normalizedName = value => String(value).toLowerCase().replace(/^named\s+[“"]|[”"]$/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const baseNames = new Set([displayName, customName].filter(Boolean).map(normalizedName));
    const seen = new Set();
    return details.filter(Boolean).filter(detail => {
      const normalized = normalizedName(detail);
      if (!normalized || baseNames.has(normalized) || seen.has(normalized)) return false;
      seen.add(normalized); return true;
    });
  }
  const itemPresentation = item => window.EnthusiaMarketAdapter.itemPresentation(item);
  const publicItemName = value => window.EnthusiaMarketAdapter.stripMinecraftFormatting(value);
  function transactionQuantity(amount, itemName, direction, side) {
    const grouped = window.EnthusiaMarketAdapter.formatTransactionQuantity(amount, direction, side);
    const label = `${amount} ${itemName} — ${grouped}`;
    return `<span class="transaction-quantity" title="${esc(label)}" aria-label="${esc(label)}"><span aria-hidden="true">${esc(grouped)} ${esc(itemName)}</span></span>`;
  }
  function transactionLabels(direction) { return direction === "BUY" ? ["YOU PROVIDE", "YOU RECEIVE"] : direction === "TRADE" ? ["YOU RECEIVE", "YOU GIVE"] : ["YOU RECEIVE", "YOU PAY"]; }
  function iconDefinition(item) {
    const potionKey = item.metadata?.potion?.id ? `${item.material}:${item.metadata.potion.id}` : null;
    if (potionKey && iconManifest.potionVariants?.[potionKey]) return [{src: iconManifest.potionVariants[potionKey], preRendered: true}];
    const definition = iconManifest.materials[item.material] || iconManifest.fallback;
    const layers = [...definition.layers];
    const trim = item.metadata?.armorTrim?.material?.toUpperCase().replaceAll(" ", "_");
    if (trim && definition.variants?.armorTrim?.[trim]) layers.push(...definition.variants.armorTrim[trim]);
    return layers;
  }
  const iconItemRegistry = new Map();
  let iconItemSequence = 0;
  const hasGlint = item => item.metadata?.glintOverride !== false && (item.metadata?.glintOverride === true || item.metadata?.enchantments?.length || item.metadata?.storedEnchantments?.length);
  function itemIcon(item, extraClass = "") {
    const definitions = iconDefinition(item);
    const enchanted = hasGlint(item), key = `icon-${++iconItemSequence}`;
    iconItemRegistry.set(key, item);
    const silhouette = definitions.find(layer => !layer.tintSource)?.src || definitions[0]?.src;
    const glintTexture = iconManifest.glint?.item || "minecraft/vanilla/textures/misc/enchanted_glint_item.png";
    const glint = enchanted && silhouette ? `<span class="item-glint" style="--item-silhouette:url('${cssAssetBase}${silhouette}');--glint-texture:url('${cssAssetBase}${glintTexture}')" aria-hidden="true"></span>` : "";
    return `<span class="minecraft-item-icon${enchanted ? " enchanted" : ""} ${extraClass}" data-icon-key="${key}" role="img" aria-label="${esc(publicItemName(item.displayName))}"><canvas class="item-raster" width="16" height="16" aria-hidden="true"></canvas>${glint}</span>`;
  }
  function minecraftText(value, className = "") {
    const text = String(value ?? "");
    const glyph = character => {
      const code = character.codePointAt(0), width = fontManifest?.widths?.[code] || 6;
      if (!fontManifest || code < 32 || code > 126) return `<span class="mc-fallback">${esc(character)}</span>`;
      return `<span class="mc-glyph${character === " " ? " space" : ""}" style="--mc-col:${code % 16};--mc-row:${Math.floor(code / 16)};--mc-width:${width}" aria-hidden="true"></span>`;
    };
    const words = className.split(/\s+/).includes("identifier") ? text.split(/([_:])/).filter(Boolean) : text.match(/\s+|\S+/g) || [];
    return `<span class="minecraft-bitmap-text ${className}" style="--mc-font:url('${cssAssetBase}${fontManifest?.texture || "minecraft/vanilla/textures/font/ascii.png"}')" aria-label="${esc(text)}"><span class="mc-text-value" aria-hidden="true">${esc(text)}</span>${words.map(word => /^\s+$/.test(word) ? [...word].map(glyph).join("") : `<span class="mc-word">${[...word].map(glyph).join("")}</span>`).join("")}</span>`;
  }
  function floatingTooltipMarkup(item) {
    const details = itemMetadata(item), presentation = itemPresentation(item);
    return `<strong>${minecraftText(presentation.customDisplayName || presentation.baseDisplayName)}</strong>${presentation.customDisplayName ? minecraftText(presentation.baseDisplayName, "muted") : ""}${details.map(detail => minecraftText(detail, "muted")).join("")}`;
  }
  function showItemTooltip(anchor, item) {
    el.itemTooltip.innerHTML = floatingTooltipMarkup(item); el.itemTooltip.hidden = false; el.itemTooltip.style.visibility = "hidden";
    requestAnimationFrame(() => {
      if (el.itemTooltip.hidden) return;
      const margin = 10, anchorRect = anchor.getBoundingClientRect(), tooltipRect = el.itemTooltip.getBoundingClientRect(), viewport = visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0, viewportTop = viewport?.offsetTop || 0, viewportRight = viewportLeft + (viewport?.width || innerWidth), viewportBottom = viewportTop + (viewport?.height || innerHeight);
      if (isMobile()) {
        el.itemTooltip.classList.add("mobile"); el.itemTooltip.style.left = `${viewportLeft + margin}px`; el.itemTooltip.style.right = `${Math.max(margin, innerWidth - viewportRight + margin)}px`; el.itemTooltip.style.bottom = "auto";
        el.itemTooltip.style.top = `${Math.max(viewportTop + margin, viewportBottom - tooltipRect.height - 76)}px`;
      } else {
        el.itemTooltip.classList.remove("mobile"); el.itemTooltip.style.right = "auto"; el.itemTooltip.style.bottom = "auto";
        let left = anchorRect.right + margin;
        if (left + tooltipRect.width > viewportRight - margin) left = anchorRect.left - tooltipRect.width - margin;
        let top = anchorRect.top;
        if (top + tooltipRect.height > viewportBottom - margin) top = viewportBottom - tooltipRect.height - margin;
        el.itemTooltip.style.left = `${Math.max(viewportLeft + margin, Math.min(left, viewportRight - tooltipRect.width - margin))}px`;
        el.itemTooltip.style.top = `${Math.max(viewportTop + margin, top)}px`;
      }
      el.itemTooltip.style.visibility = "visible";
    });
  }
  function hideItemTooltip() { el.itemTooltip.hidden = true; el.itemTooltip.style.visibility = "hidden"; }
  function bindItemTooltip(node, item) {
    node.addEventListener("pointerenter", () => showItemTooltip(node, item)); node.addEventListener("pointerleave", hideItemTooltip);
    node.addEventListener("focus", () => showItemTooltip(node, item)); node.addEventListener("blur", hideItemTooltip);
  }
  function itemPanel(item, amount, label, shopId, direction, side) {
    const presentation = itemPresentation(item);
    return `<button class="transaction-side" data-inspect-shop="${shopId}" data-inspect-side="${side}" aria-label="Inspect ${esc(label.toLowerCase())}: ${esc(presentation.baseDisplayName)}"><span class="transaction-label">${label}</span><span class="transaction-item">${itemIcon(item)}<span class="item-copy"><strong class="fit-item-name">${transactionQuantity(amount, presentation.baseDisplayName, direction, side)}</strong></span></span></button>`;
  }
  const textFitObserver = new ResizeObserver(entries => entries.forEach(({target}) => fitItemText(target)));
  const identifierFitObserver = new ResizeObserver(entries => entries.forEach(({target}) => fitIdentifierText(target)));
  function fitItemText(node) {
    const bitmap = node.querySelector(".minecraft-bitmap-text");
    if (bitmap) {
      bitmap.style.setProperty("--heading-scale", String(Math.max(.78, Math.min(1.15, node.clientWidth / Math.max(1, bitmap.scrollWidth)))));
      return;
    }
    node.style.removeProperty("font-size");
    const normal = Number.parseFloat(getComputedStyle(node).fontSize) || 13;
    for (let size = normal; size >= 10; size -= .5) {
      node.style.fontSize = `${size}px`;
      if (node.scrollHeight <= Math.ceil(Number.parseFloat(getComputedStyle(node).lineHeight) * 2 + 1) && node.scrollWidth <= node.clientWidth + 1) break;
    }
  }
  function observeItemText(root) {
    root.querySelectorAll(".fit-item-name,.fit-inspector-heading").forEach(node => { textFitObserver.observe(node); fitItemText(node); });
    root.querySelectorAll(".minecraft-bitmap-text.identifier").forEach(node => { identifierFitObserver.observe(node); fitIdentifierText(node); });
  }
  function fitIdentifierText(node) {
    const text = node.getAttribute("aria-label") || "", available = node.parentElement?.clientWidth || node.clientWidth;
    const advance = [...text].reduce((sum, character) => sum + (fontManifest?.widths?.[character.codePointAt(0)] || 6), 0);
    const pixelSize = Math.max(1.2, Math.min(2, available / Math.max(1, advance)));
    node.style.setProperty("--identifier-pixel", `${pixelSize}px`);
    node.classList.toggle("identifier-wrap", advance * pixelSize > available + 1);
  }

  const mobileSurfaces = [el.drawer, el.inspector, el.results, filterFields];
  function sheetLabel(surface) { return surface.querySelector(".sheet-compact-label"); }
  function updateSheetHandle(surface, stateName) {
    const handle = surface.querySelector(".mobile-sheet-handle"); if (!handle) return;
    const expanded = stateName !== "collapsed" && stateName !== "hidden";
    handle.setAttribute("aria-expanded", String(expanded));
    handle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${surface === filterFields ? "filters" : surface === el.results ? "search results" : "market details"}`);
  }
  function activateSheet(type, surface, label, nextState = "normal", returnFocus = null) {
    if (!isMobile()) return;
    hideSuggestions();
    for (const candidate of mobileSurfaces) candidate.classList.toggle("sheet-suppressed", candidate !== surface && candidate !== state.collapsedContext);
    surface.classList.add("mobile-sheet-active"); surface.dataset.sheetState = nextState;
    if (surface === el.results) surface.classList.add("mobile-sheet");
    if (surface === filterFields) surface.classList.add("open");
    if (label) sheetLabel(surface).textContent = label;
    state.sheet = {type, state: nextState, previous: nextState === "collapsed" ? state.sheet.previous || "normal" : nextState, surface, returnFocus: returnFocus || state.sheet.returnFocus, gesture: null};
    updateSheetHandle(surface, nextState);
    updateViewportMetrics();
  }
  function setSheetState(nextState) {
    const sheet = state.sheet, surface = sheet.surface; if (!isMobile() || !surface) return;
    if (nextState === "hidden") {
      surface.classList.remove("mobile-sheet-active", "mobile-sheet"); surface.classList.add("sheet-suppressed"); surface.dataset.sheetState = "hidden";
      if (surface === filterFields) surface.classList.remove("open");
      state.sheet = {type: null, state: "hidden", previous: sheet.previous || "normal", surface: null, returnFocus: null, gesture: null};
      sheet.returnFocus?.focus?.({preventScroll: true}); return;
    }
    const previous = nextState === "collapsed" ? (sheet.state === "expanded" ? "expanded" : "normal") : nextState;
    surface.dataset.sheetState = nextState; state.sheet.state = nextState; state.sheet.previous = previous;
    updateSheetHandle(surface, nextState);
    if (nextState === "collapsed") surface.querySelector(".mobile-sheet-handle")?.focus({preventScroll: true});
  }
  function toggleSheet() { setSheetState(state.sheet.state === "collapsed" ? state.sheet.previous || "normal" : "collapsed"); }
  function bindSheetSurface(surface) {
    const handle = surface.querySelector(".mobile-sheet-handle"); if (!handle) return;
    let handleGesture = null;
    handle.addEventListener("pointerdown", event => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const started = state.collapsedContext === surface ? "collapsed" : state.sheet.state;
      handleGesture = {id: event.pointerId, startY: event.clientY, moved: false, started, time: performance.now()};
      try { handle.setPointerCapture(event.pointerId); } catch {}
    });
    handle.addEventListener("pointermove", event => { if (handleGesture?.id === event.pointerId && Math.abs(event.clientY - handleGesture.startY) > 6) handleGesture.moved = true; });
    handle.addEventListener("pointerup", event => {
      const gesture = handleGesture; handleGesture = null; if (!gesture || gesture.id !== event.pointerId) return;
      const delta = event.clientY - gesture.startY, velocity = delta / Math.max(1, performance.now() - gesture.time);
      if (state.collapsedContext === surface) { if (!gesture.moved || delta < -35) restoreCollapsedContext(); return; }
      if (!gesture.moved) toggleSheet();
      else if (delta < -45 && gesture.started === "collapsed") setSheetState(state.sheet.previous || "normal");
      else if (delta > 45 && gesture.started !== "collapsed") setSheetState("collapsed");
      else if (delta > 80 && gesture.started === "collapsed" && velocity > .35) setSheetState("hidden");
    });
    handle.addEventListener("click", event => { if (event.detail === 0) state.collapsedContext === surface ? restoreCollapsedContext() : toggleSheet(); });
    surface.addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" || event.target.closest(".mobile-sheet-handle") || surface.scrollTop > 0) return;
      state.sheet.contentGesture = {id: event.pointerId, startY: event.clientY, startX: event.clientX};
    });
    surface.addEventListener("pointerup", event => {
      const gesture = state.sheet.contentGesture; state.sheet.contentGesture = null;
      if (!gesture || gesture.id !== event.pointerId || surface.scrollTop > 0) return;
      const dy = event.clientY - gesture.startY, dx = Math.abs(event.clientX - gesture.startX);
      if (dy > 70 && dy > dx * 1.5) setSheetState("collapsed");
    });
    surface.addEventListener("pointercancel", () => { state.sheet.contentGesture = null; });
  }
  mobileSurfaces.forEach(bindSheetSurface);

  function preserveDetailContext() {
    if (!isMobile()) return;
    const surface = !el.inspector.hidden ? el.inspector : !el.drawer.hidden ? el.drawer : null;
    if (!surface) return;
    state.collapsedContext = surface;
    surface.hidden = false;
    surface.classList.add("mobile-sheet-active", "mobile-context-tab");
    surface.classList.remove("sheet-suppressed");
    surface.dataset.sheetState = "collapsed";
    updateSheetHandle(surface, "collapsed");
    document.body.classList.toggle("inspector-open", surface === el.inspector);
    updateViewportMetrics();
  }
  function clearCollapsedContext(hide = true) {
    const surface = state.collapsedContext;
    if (!surface) return;
    surface.classList.remove("mobile-context-tab", "mobile-sheet-active");
    surface.dataset.sheetState = "hidden";
    if (hide) surface.hidden = true;
    state.collapsedContext = null;
    updateViewportMetrics();
  }
  function restoreCollapsedContext() {
    const surface = state.collapsedContext;
    if (!surface) return;
    hideMobileResults();
    state.collapsedContext = null;
    surface.classList.remove("mobile-context-tab", "sheet-suppressed");
    activateSheet("details", surface, sheetLabel(surface)?.textContent || "Market details", "normal", el.viewport);
  }

  function openBuilding(building) {
    if (!snapshot) return;
    closeInspector(); hideMobileResults(); filterFields.classList.remove("open"); state.mobileStack = [{type: "building", id: building.id}]; selectMap(building.id);
    if (building.stallIds.length === 1) return openStall(adapter.getStall(building.stallIds[0]), null);
    state.drawerBuilding = building; state.drawerMode = "building"; renderBuildingDrawer(); showDrawer();
  }
  function showDrawer() { el.drawer.hidden = false; el.backdrop.hidden = false; if (isMobile()) activateSheet("details", el.drawer, state.drawerBuilding?.label || el.title.textContent, "normal", el.viewport); else requestAnimationFrame(() => $("#drawer-close").focus()); }
  function closeDrawer() { closeInspector(); hideMobileResults(); el.drawer.hidden = true; el.drawer.classList.remove("mobile-sheet-active"); el.backdrop.hidden = true; state.drawerMode = null; state.drawerBuilding = null; state.highlightShop = null; state.mobileStack = []; state.searchReturn = false; selectMap(null); }
  function renderBuildingDrawer() {
    const building = state.drawerBuilding;
    const totalShops = building.stallIds.reduce((sum, id) => sum + (adapter.getStall(id)?.shops.length || 0), 0);
    const multipleFloors = building.floors.length > 1;
    el.kicker.textContent = "Market building"; el.title.textContent = building.label; el.summary.textContent = `${building.stallIds.length} stalls · ${totalShops} shops`; el.back.hidden = true;
    const anyMatch = building.stallIds.some(id => state.matching.has(id));
    el.content.innerHTML = `${anyMatch ? "" : `<p class="filter-empty-notice">No shops in this building match the current filters.</p>`}<div class="building-stall-groups">${[...building.floors].sort((a, b) => a.index - b.index).map(floor => `<section class="stall-group">${multipleFloors ? `<h3>${esc(floor.name)}</h3>` : ""}<div class="stall-card-list">${[...floor.stallIds].sort((left, right) => Number(state.matching.has(right)) - Number(state.matching.has(left)) || C.naturalCompare(left, right)).map(id => stallCard(adapter.getStall(id), state.matching.has(id))).join("")}</div></section>`).join("")}</div>`;
    hydrateOwnerVisuals(el.content);
    el.content.querySelectorAll("[data-stall]").forEach(node => node.onclick = () => openStall(adapter.getStall(node.dataset.stall), building));
  }
  function stallCard(stall, matches = true) {
    const stock = stall.shops.reduce((sum, shop) => sum + shop.stockCount, 0);
    const categories = [...new Set(stall.shops.map(shop => ({ SELL: "Selling", BUY: "Buying", TRADE: "Trading" })[shop.direction]))].join(" · ") || "No shops listed";
    return `<button class="stall-card${matches ? "" : " filter-unmatched"}" data-stall="${stall.id}">${ownerVisual(stall.owner)}<span class="stall-card-copy"><span class="stall-number">${displayStall(stall.id)}</span><strong>${esc(stall.owner.name)}</strong><small>${ownerType(stall.owner)} · ${stall.shops.length} shop${stall.shops.length === 1 ? "" : "s"}</small><small>${categories}</small>${matches ? "" : `<small class="filter-no-match">No shops in this stall match the current filters.</small>`}</span><span class="stock-line">${stock > 0 ? "In stock" : "No stock"}</span></button>`;
  }
  function ownershipDuration(date) {
    if (!date) return "Not currently owned";
    const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
    if (days < 31) return `${days} day${days === 1 ? "" : "s"}`;
    const months = Math.floor(days / 30); return `${months} month${months === 1 ? "" : "s"}`;
  }
  function openStall(stall, fromBuilding = state.drawerBuilding, shopId = null) {
    if (!stall) return;
    closeInspector(); hideMobileResults(); state.drawerMode = "stall";
    state.drawerBuilding = fromBuilding || layout.buildings.find(building => building.id === stall.buildingId);
    state.highlightShop = shopId; selectMap(stall.buildingId, stall.id);
    const building = layout.buildings.find(item => item.id === stall.buildingId), floor = building.floors.find(item => item.index === stall.floor);
    el.kicker.textContent = `${building.label} · ${floor?.name || C.floorName(stall.floor)}`; el.title.textContent = displayStall(stall.id);
    el.summary.textContent = stall.owner.type === "NONE" ? "Available market stall" : `${ownerType(stall.owner)} owned · ${stall.shops.length} shops`;
    el.back.hidden = !fromBuilding || building.stallIds.length === 1;
    const members = stall.members.length ? `<section class="member-list"><h3>Members</h3><p>${stall.members.map(esc).join(" · ")}</p></section>` : "";
    const orderedShops = stall.shops.map((shop, index) => ({shop, index})).sort((left, right) => Number(right.shop.stockCount > 0) - Number(left.shop.stockCount > 0) || left.index - right.index).map(entry => entry.shop);
    el.content.innerHTML = `<div class="stall-hero">${ownerVisual(stall.owner, true)}<div><p class="eyebrow">${stall.owner.type === "NONE" ? "Available" : "Current owner"}</p><h3>${esc(stall.owner.name)}</h3><p>${stall.ownerSince ? `Owned for ${ownershipDuration(stall.ownerSince)} · since ${new Date(stall.ownerSince).toLocaleDateString()}` : "Ready to rent"}</p></div></div>${locationMarkup(stall.location)}<div class="detail-grid"><div><small>Rent remaining</small>${rentMarkup(stall)}</div><div><small>Members</small><strong>${stall.members.length}</strong></div><div><small>Shops</small><strong>${stall.shops.length}</strong></div></div>${members}<h3>Shops</h3><div class="shop-list">${orderedShops.length ? orderedShops.map(shop => shopCard(shop, shop.id === shopId)).join("") : `<div class="shop-card empty"><strong>This stall is ready for its next shop.</strong><small>Ownership and live shop data will appear here.</small></div>`}</div>`;
    hydrateOwnerVisuals(el.content);
    state.mobileStack = [...state.mobileStack.filter(entry => entry.type !== "stall"), {type: "stall", id: stall.id}]; showDrawer(); bindDrawerActions();
    if (shopId) requestAnimationFrame(() => el.content.querySelector(".shop-card.highlight")?.scrollIntoView({ block: "center" }));
  }
  function shopCard(shop, highlight) {
    const labels = transactionLabels(shop.direction), action = { SELL: "Selling", BUY: "Buying", TRADE: "Trading" }[shop.direction];
    const out = shop.stockCount <= 0;
    return `<article class="shop-card${highlight ? " highlight" : ""}${out ? " out-of-stock" : ""}" data-shop="${shop.id}" tabindex="0" role="button" aria-label="Inspect ${action.toLowerCase()} shop by ${esc(shop.owner.name)}"><header><span class="direction">${action}</span><small>Shop by <strong title="${esc(shop.owner.name)}">${esc(shop.owner.name)}</strong></small></header>${out ? `<strong class="stock-badge">Out of stock</strong>` : ""}<div class="transaction-grid">${itemPanel(shop.sellItem, shop.sellAmount, labels[0], shop.id, shop.direction, "sellItem")}<span class="transaction-arrow" aria-hidden="true">⇄</span>${itemPanel(shop.costItem, shop.costAmount, labels[1], shop.id, shop.direction, "costItem")}</div><footer><span>${shop.stockCount} in stock · ${shop.availableTrades} trades available</span>${locationMarkup(shop.interaction, true)}</footer></article>`;
  }
  function bindDrawerActions() {
    bindCopy(el.content);
    observeItemText(el.content);
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
    hideMobileResults(); state.mobileStack.push({type: "shop", id: shop.id});
    const selectedSide = side || (shop.direction === "BUY" ? "sellItem" : "sellItem");
    const labels = transactionLabels(shop.direction);
    state.inspectorHistory = [inspectorEntry(shop, selectedSide, shop[selectedSide], selectedSide === "sellItem" ? labels[0] : labels[1])];
    if (match?.contained && match.container) {
      const containerSide = match.side;
      const role = containerSide === "sellItem" ? labels[0] : labels[1];
      let containerItem = shop[containerSide]; state.inspectorHistory = [inspectorEntry(shop, containerSide, containerItem, role, 0)];
      for (let index = 0; index < Math.max(0, match.path.length - 1); index += 1) {
        const step = match.path[index], child = containerItem.metadata?.container?.contents?.find((value, childIndex) => step.slot == null ? childIndex === step.index : value.slot === step.slot)?.item;
        if (!child) break; containerItem = child; state.inspectorHistory.push(inspectorEntry(shop, containerSide, containerItem, role, index + 1));
      }
      state.inspectorHistory.at(-1).context = { focusMaterial: match.item.material };
    }
    renderInspector();
  }
  function closeInspector() { el.inspector.hidden = true; el.inspector.classList.remove("mobile-sheet-active"); state.inspectorHistory = []; hideItemTooltip(); document.body.classList.remove("inspector-open"); state.mobileStack = state.mobileStack.filter(entry => !["shop", "container"].includes(entry.type)); }
  function selectInspectorSide(shop, side) {
    const labels = transactionLabels(shop.direction);
    state.inspectorHistory = [inspectorEntry(shop, side, shop[side], side === "sellItem" ? labels[0] : labels[1])];
    renderInspector();
  }
  function inspectContained(item, context, depth) {
    if (depth > 4) return;
    const current = state.inspectorHistory.at(-1);
    state.inspectorHistory.push(inspectorEntry(current.shop, current.side, item, current.role, depth, context));
    state.mobileStack.push({type: "container", material: item.material});
    renderInspector();
  }
  function inspectorItemDetails(item) {
    const metadata = itemMetadata(item), presentation = itemPresentation(item);
    const heading = presentation.customDisplayName || presentation.baseDisplayName;
    return `<section class="minecraft-tooltip"><div class="inspected-item">${itemIcon(item, "large")}<div><h3 class="fit-inspector-heading">${minecraftText(heading)}</h3>${presentation.customDisplayName ? `<p>${minecraftText(presentation.baseDisplayName, "muted")}</p>` : ""}</div></div>${metadata.length ? `<ul>${metadata.map(detail => `<li>${minecraftText(detail, "muted")}</li>`).join("")}</ul>` : ""}<code>${minecraftText(`minecraft:${item.material.toLowerCase()}`, "identifier")}</code></section>`;
  }
  const canvasImageCache = new Map();
  const canonicalRasterCache = new Map();
  function loadCanvasImage(relative) {
    const source = `${assetBase}${relative}`;
    if (!canvasImageCache.has(source)) canvasImageCache.set(source, new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = "async"; image.onload = () => resolve(image); image.onerror = reject; image.src = source;
    }).catch(error => { canvasImageCache.delete(source); throw error; }));
    return canvasImageCache.get(source);
  }
  function tintCanvas(canvas, tint) {
    const context = canvas.getContext("2d"), color = String(tint || "#FFFFFF").match(/[0-9a-f]{2}/gi)?.map(value => Number.parseInt(value, 16)) || [255,255,255];
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = Math.round(pixels.data[index] * color[0] / 255);
      pixels.data[index + 1] = Math.round(pixels.data[index + 1] * color[1] / 255);
      pixels.data[index + 2] = Math.round(pixels.data[index + 2] * color[2] / 255);
    }
    context.putImageData(pixels, 0, 0); return canvas;
  }
  function canonicalRasterKey(item, includeGlint) {
    return JSON.stringify([item.material, item.metadata?.potion, item.metadata?.armorTrim, item.metadata?.enchantments, item.metadata?.storedEnchantments, item.metadata?.glintOverride, includeGlint]);
  }
  async function canonicalItemRaster(item, includeGlint = false) {
    const key = canonicalRasterKey(item, includeGlint);
    if (canonicalRasterCache.has(key)) return canonicalRasterCache.get(key);
    const promise = (async () => {
    const icon = document.createElement("canvas"); icon.width = 16; icon.height = 16;
    const iconContext = icon.getContext("2d"); iconContext.imageSmoothingEnabled = false;
    for (const layer of iconDefinition(item)) {
      const image = await loadCanvasImage(layer.src), layerCanvas = document.createElement("canvas"); layerCanvas.width = 16; layerCanvas.height = 16;
      const layerContext = layerCanvas.getContext("2d"); layerContext.imageSmoothingEnabled = false; layerContext.drawImage(image, 0, 0, 16, 16);
      if (layer.tint || layer.tintSource) tintCanvas(layerCanvas, layer.tint || item.metadata?.potion?.color || layer.defaultTint);
      iconContext.drawImage(layerCanvas, 0, 0);
    }
    if (includeGlint && hasGlint(item) && iconManifest.glint?.item) {
      const glintImage = await loadCanvasImage(iconManifest.glint.item), glint = document.createElement("canvas"); glint.width = 16; glint.height = 16;
      const glintContext = glint.getContext("2d"); glintContext.imageSmoothingEnabled = false; glintContext.globalAlpha = .58; glintContext.drawImage(glintImage, 0, 0, 16, 16);
      glintContext.globalCompositeOperation = "destination-in"; glintContext.drawImage(icon, 0, 0);
      iconContext.globalCompositeOperation = "lighter"; iconContext.drawImage(glint, 0, 0); iconContext.globalCompositeOperation = "source-over";
    }
      return icon;
    })();
    canonicalRasterCache.set(key, promise);
    return promise;
  }
  async function renderItemIconNode(node) {
    if (node.dataset.rasterRendered === "true") return;
    const item = iconItemRegistry.get(node.dataset.iconKey), canvas = node.querySelector(".item-raster");
    if (!item || !canvas) return;
    const raster = await canonicalItemRaster(item, false), context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false; context.clearRect(0, 0, 16, 16); context.drawImage(raster, 0, 0); node.dataset.rasterRendered = "true";
  }
  function hydrateItemRasters(root = document) {
    root.querySelectorAll?.(".minecraft-item-icon[data-icon-key]").forEach(node => renderItemIconNode(node).catch(error => { node.dataset.rasterError = error.message; }));
  }
  const itemRasterObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (!(node instanceof Element)) return;
    if (node.matches?.(".minecraft-item-icon[data-icon-key]")) renderItemIconNode(node);
    hydrateItemRasters(node);
  })));
  itemRasterObserver.observe(document.body, {childList: true, subtree: true});
  async function drawCanvasItem(context, item, x, y) {
    context.drawImage(await canonicalItemRaster(item, true), x, y);
  }
  async function drawMinecraftText(context, text, x, y, color, rightAligned = false) {
    const font = await loadCanvasImage(fontManifest.texture), widths = [...String(text)].map(character => fontManifest.widths?.[character.codePointAt(0)] || 6);
    const total = widths.reduce((sum, width) => sum + width, 0), layer = document.createElement("canvas"); layer.width = 176; layer.height = 76;
    const layerContext = layer.getContext("2d"); layerContext.imageSmoothingEnabled = false; let cursor = rightAligned ? x - total : x;
    for (const [index, character] of [...String(text)].entries()) {
      const code = character.codePointAt(0), width = widths[index];
      const visibleWidth = Math.max(1, width - 1);
      if (code >= 32 && code <= 126 && character !== " ") layerContext.drawImage(font, (code % 16) * 8, Math.floor(code / 16) * 8, visibleWidth, 8, cursor, y, visibleWidth, 8);
      cursor += width;
    }
    layerContext.globalCompositeOperation = "source-in"; layerContext.fillStyle = color; layerContext.fillRect(0, 0, 176, 76); context.drawImage(layer, 0, 0);
  }
  const shulkerRenderState = new WeakMap(), shulkerRenderTokens = new WeakMap(), activeShulkerCanvases = new Set();
  async function renderShulkerCanvas(canvas, item) {
    const renderToken = (shulkerRenderTokens.get(canvas) || 0) + 1; shulkerRenderTokens.set(canvas, renderToken);
    shulkerRenderState.set(canvas, item); activeShulkerCanvases.add(canvas); canvas.dataset.rendered = "false";
    const frame = canvas.closest(".shulker-frame"), wrapper = canvas.parentElement;
    const styles = getComputedStyle(frame), desiredCssWidth = Math.min(352, Math.max(1, frame.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)));
    const dpr = devicePixelRatio || 1, backingScale = 1;
    canvas.width = 176; canvas.height = 76;
    wrapper.style.width = `${desiredCssWidth}px`; wrapper.style.height = `${desiredCssWidth * 76 / 176}px`;
    const context = canvas.getContext("2d"); context.imageSmoothingEnabled = false; context.setTransform(backingScale, 0, 0, backingScale, 0, 0); context.clearRect(0, 0, 176, 76);
    const gui = await loadCanvasImage(iconManifest.gui.shulker); if (shulkerRenderTokens.get(canvas) !== renderToken) return; context.drawImage(gui, 0, 0, 176, 76, 0, 0, 176, 76);
    await drawMinecraftText(context, publicItemName(item.metadata?.customName || item.displayName), 8, 6, "#404040");
    canvas.dataset.rendered = "true"; canvas.dataset.backingScale = String(backingScale); canvas.dataset.cssWidth = String(desiredCssWidth); canvas.dataset.dpr = String(dpr);
  }
  const shulkerResizeObserver = new ResizeObserver(entries => entries.forEach(({target}) => {
    const canvas = target.querySelector(".shulker-visual"), item = canvas && shulkerRenderState.get(canvas);
    if (item) requestAnimationFrame(() => renderShulkerCanvas(canvas, item));
  }));
  addEventListener("resize", () => activeShulkerCanvases.forEach(canvas => { const item = shulkerRenderState.get(canvas); if (item && canvas.isConnected) renderShulkerCanvas(canvas, item); else activeShulkerCanvases.delete(canvas); }), {passive:true});
  function containerMarkup(entry) {
    const { item, context, depth } = entry, container = item.metadata?.container;
    if (!container) return "";
    if (container.type === "SHULKER") {
      const slots = new Map(container.contents.map(value => [value.slot, value.item]));
      return `<section class="container-inspection"><h3>${esc(itemPresentation(item).baseDisplayName)} contents</h3><div class="shulker-frame" data-shulker-color="${esc(item.metadata?.shulkerColor || "Natural")}"><div class="minecraft-shulker-window"><canvas class="shulker-visual" width="176" height="76" aria-hidden="true"></canvas><div class="shulker-item-grid" aria-hidden="true">${Array.from({length:27},(_,slot)=>{const child=slots.get(slot);return `<span class="shulker-item-cell">${child?`${itemIcon(child)}${child.amount>1?`<span class="shulker-stack-count">${minecraftText(child.amount)}</span>`:""}`:""}</span>`}).join("")}</div><div class="shulker-slot-grid">${Array.from({ length: 27 }, (_, slot) => {
        const child = slots.get(slot), focused = child && context?.focusMaterial === child.material;
        return `<button class="minecraft-slot${focused ? " focused-match" : ""}" data-container-slot="${slot}" ${child ? "" : "disabled"} aria-label="${child ? `${child.amount} ${esc(publicItemName(child.displayName))}` : "Empty slot"}"></button>`;
      }).join("")}</div></div></div></section>`;
    }
    const maximum = Math.max(1, container.capacityMax || 64), used = Math.max(0, container.capacityUsed || 0);
    const full = used >= maximum;
    return `<section class="container-inspection bundle-inspection"><h3>${esc(itemPresentation(item).baseDisplayName)} contents</h3><div class="minecraft-bundle-tooltip"><div class="bundle-title">${minecraftText(publicItemName(item.metadata?.customName || "Bundle"))}</div><div class="bundle-item-grid">${container.contents.map((value, index) => { const child = value.item, focused = context?.focusMaterial === child.material; return `<button class="bundle-slot${focused ? " focused-match" : ""}" style="--bundle-slot:url('${cssAssetBase}${iconManifest.gui.bundleSlot}')" data-container-index="${index}" aria-label="${child.amount} ${esc(publicItemName(child.displayName))}">${itemIcon(child)}${child.amount > 1 ? `<span class="stack-count">${minecraftText(child.amount)}</span>` : ""}</button>`; }).join("")}</div><div class="bundle-capacity-label">${minecraftText(full ? "Full!" : `${used}/${maximum}`)}</div><div class="bundle-capacity${full ? " full" : ""}" aria-label="${used} of ${maximum} bundle capacity used" style="--bundle-border:url('${cssAssetBase}${iconManifest.gui.bundleBorder}');--bundle-fill:url('${cssAssetBase}${full ? iconManifest.gui.bundleFull : iconManifest.gui.bundleFill}')"><span style="width:${Math.min(100, used / maximum * 100)}%"></span></div></div></section>`;
  }
  function renderInspector() {
    const entry = state.inspectorHistory.at(-1), { shop, item } = entry;
    const labels = transactionLabels(shop.direction), action = { SELL: "Selling", BUY: "Buying", TRADE: "Trading" }[shop.direction];
    el.inspector.hidden = false; document.body.classList.add("inspector-open");
    const presentation = itemPresentation(item);
    el.inspectorKicker.textContent = `${action} · ${entry.role}`; el.inspectorTitle.textContent = "Item details";
    const backLabel = state.inspectorHistory.length > 1 ? `Back to ${publicItemName(state.inspectorHistory.at(-2).item.displayName)}` : state.searchReturn ? "Back to search results" : "Back to stall";
    const sellPresentation = itemPresentation(shop.sellItem), costPresentation = itemPresentation(shop.costItem);
    el.inspectorContent.innerHTML = `<button class="inspector-back mobile-navigation-back" type="button">← ${esc(backLabel)}</button><section class="inspector-shop-context"><span>Shop by <strong>${esc(shop.owner.name)}</strong></span>${locationMarkup(shop.interaction, true)}</section><div class="inspector-transaction-tabs"><button class="${entry.side === "sellItem" && state.inspectorHistory.length === 1 ? "active" : ""}" data-inspector-side="sellItem"><span class="transaction-tab-label">${labels[0]}</span>${itemIcon(shop.sellItem)}<strong>${transactionQuantity(shop.sellAmount, sellPresentation.baseDisplayName, shop.direction, "sellItem")}</strong></button><button class="${entry.side === "costItem" && state.inspectorHistory.length === 1 ? "active" : ""}" data-inspector-side="costItem"><span class="transaction-tab-label">${labels[1]}</span>${itemIcon(shop.costItem)}<strong>${transactionQuantity(shop.costAmount, costPresentation.baseDisplayName, shop.direction, "costItem")}</strong></button></div>${inspectorItemDetails(item)}${containerMarkup(entry)}`;
    bindCopy(el.inspectorContent);
    observeItemText(el.inspectorContent);
    const shulkerCanvas = el.inspectorContent.querySelector(".shulker-visual");
    if (shulkerCanvas) { shulkerResizeObserver.observe(shulkerCanvas.closest(".shulker-frame")); renderShulkerCanvas(shulkerCanvas, item).catch(error => { shulkerCanvas.dataset.renderError = error.message; }); }
    el.inspectorContent.querySelectorAll("[data-inspector-side]").forEach(button => button.onclick = () => selectInspectorSide(shop, button.dataset.inspectorSide));
    el.inspectorContent.querySelector(".inspector-back")?.addEventListener("click", () => {
      if (state.inspectorHistory.length > 1) { state.inspectorHistory.pop(); state.mobileStack.pop(); renderInspector(); }
      else if (state.searchReturn) { closeInspector(); el.drawer.hidden = true; el.backdrop.hidden = true; showMobileResults(); }
      else { closeInspector(); if (!el.drawer.hidden) showDrawer(); }
    });
    const container = item.metadata?.container;
    el.inspectorContent.querySelectorAll("[data-container-slot]").forEach(button => button.onclick = () => {
      const child = container.contents.find(value => value.slot === Number(button.dataset.containerSlot))?.item;
      if (child) inspectContained(child, null, entry.depth + 1);
    });
    el.inspectorContent.querySelectorAll("[data-container-index]").forEach(button => {
      button.onclick = () => inspectContained(container.contents[Number(button.dataset.containerIndex)].item, null, entry.depth + 1);
    });
    el.inspectorContent.querySelectorAll("[data-container-slot]").forEach(button => {
      const child = container.contents.find(value => value.slot === Number(button.dataset.containerSlot))?.item;
      if (child) bindItemTooltip(button, child);
    });
    el.inspectorContent.querySelectorAll("[data-container-index]").forEach(button => bindItemTooltip(button, container.contents[Number(button.dataset.containerIndex)].item));
    requestAnimationFrame(() => el.inspectorContent.querySelector(".focused-match")?.scrollIntoView({ block: "center" }));
    if (isMobile()) activateSheet("details", el.inspector, presentation.customDisplayName || presentation.baseDisplayName, "expanded", el.viewport);
  }

  function matchingShops(stall) {
    const filter = state.filters;
    if ((filter.floor !== "ALL" && stall.floor !== Number(filter.floor)) || (filter.owner !== "ALL" && stall.owner.type !== filter.owner) || !matchesRentFilter(stall, filter.rent)) return [];
    return stall.shops.filter(shop => (filter.shop === "ALL" || shop.direction === filter.shop) && (filter.stock === "ALL" || (filter.stock === "IN" ? shop.stockCount > 0 : shop.stockCount <= 0)));
  }
  function matchesFilters(stall) {
    const baseMatches = (state.filters.floor === "ALL" || stall.floor === Number(state.filters.floor)) && (state.filters.owner === "ALL" || stall.owner.type === state.filters.owner) && matchesRentFilter(stall, state.filters.rent);
    if (!baseMatches) return false;
    if (!stall.shops.length) return state.filters.shop === "ALL" && state.filters.stock === "ALL";
    return matchingShops(stall).length > 0;
  }
  function applyFilters() {
    state.matching = snapshot ? new Set(snapshot.stalls.filter(matchesFilters).map(stall => stall.id)) : new Set(layout.stalls.map(stall => stall.id));
    for (const stall of layout.stalls) stallElements.get(stall.id).classList.toggle("filtered", !state.matching.has(stall.id));
    for (const building of layout.buildings) buildingElements.get(building.id).classList.toggle("filtered", !building.stallIds.some(id => state.matching.has(id)));
    $("#result-count").textContent = snapshot ? `${state.matching.size} of ${layout.stalls.length} stalls` : "Market data unavailable";
    const labels = { floor: "Floor", owner: "Owner", shop: "Shop", stock: "Stock", rent: "Rent" }, selectors = {floor:"#floor-filter",owner:"#owner-filter",shop:"#shop-filter",stock:"#stock-filter",rent:"#rent-filter"};
    const active = Object.entries(state.filters).filter(([, value]) => value && value !== "ALL");
    $("#filter-chips").innerHTML = active.map(([key]) => { const select = $(selectors[key]), display = select.options[select.selectedIndex]?.text || state.filters[key]; return `<span class="chip">${labels[key]}: ${esc(display)} <button type="button" data-remove-filter="${key}" aria-label="Remove ${labels[key]} filter">×</button></span>`; }).join("") + (active.length ? `<button id="clear-active-filters" class="clear-active-filters" type="button">Clear all filters</button>` : "");
    $("#filter-chips").querySelectorAll("[data-remove-filter]").forEach(button => button.onclick = () => { const key = button.dataset.removeFilter; state.filters[key] = "ALL"; $(selectors[key]).value = "ALL"; applyFilters(); });
    $("#clear-active-filters")?.addEventListener("click", clearFilters);
    if (state.drawerMode === "building" && state.drawerBuilding) renderBuildingDrawer();
  }
  function clearFilters() {
    state.filters = { floor: "ALL", owner: "ALL", shop: "ALL", stock: "ALL", rent: "ALL" };
    $("#floor-filter").value = $("#owner-filter").value = $("#shop-filter").value = $("#stock-filter").value = $("#rent-filter").value = "ALL"; applyFilters();
  }
  function matchesRentFilter(stall, filter) {
    if (!filter || filter === "ALL") return true;
    if (filter === "AVAILABLE") return stall.owner.type === "NONE" && stall.available !== false;
    if ((stall.stallState || "OWNED") !== "OWNED" || stall.owner.type === "NONE" || !stall.nextRentAt) return false;
    const remaining = new Date(stall.nextRentAt).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return false;
    return filter === "UNDER_1_DAY" ? remaining <= 24 * 3600000 : filter === "UNDER_3_DAYS" ? remaining <= 72 * 3600000 : false;
  }
  for (const floor of [...new Set(layout.stalls.map(stall => stall.floor))].sort((a, b) => a - b)) {
    const option = document.createElement("option"); option.value = floor; option.textContent = C.floorName(floor); $("#floor-filter").append(option);
  }
  for (const [selector, key] of [["#floor-filter", "floor"], ["#owner-filter", "owner"], ["#shop-filter", "shop"], ["#stock-filter", "stock"], ["#rent-filter", "rent"]]) {
    $(selector).addEventListener("change", event => { state.filters[key] = event.target.value; applyFilters(); });
  }
  $("#clear-filters").onclick = clearFilters;
  $("#apply-filters").onclick = () => { applyFilters(); if (isMobile()) setSheetState("collapsed"); };
  $("#collapse-filters").onclick = () => setSheetState("collapsed");
  $("#mobile-filters").onclick = () => {
    closeInspector(); hideMobileResults(); el.drawer.hidden = true; el.backdrop.hidden = true;
    activateSheet("filters", filterFields, "Filters", "normal", $("#mobile-filters"));
    $("#mobile-filters").setAttribute("aria-expanded", "true");
  };

  function hideMobileResults() {
    el.results.classList.remove("mobile-sheet", "mobile-sheet-active");
    if (state.sheet.surface === el.results) state.sheet = {type: null, state: "hidden", previous: "normal", surface: null, returnFocus: null, gesture: null};
    state.mobileResultsOpen = false;
  }
  function showMobileResults() {
    if (!isMobile() || !state.lastSearch) return;
    state.mobileResultsOpen = true;
    activateSheet("results", el.results, state.lastSearch.query ? `Results for “${state.lastSearch.query}”` : "Search results", "normal", $("#item-search"));
    el.resultsContent.scrollTop = 0;
  }

  function executeSearch(query = $("#item-search").value) {
    const value = query.trim(), shops = value ? adapter.searchItems(value).map((shop, index) => ({shop, index})).sort((left, right) => Number(right.shop.stockCount > 0) - Number(left.shop.stockCount > 0) || left.index - right.index).map(entry => entry.shop) : [];
    $("#item-search").value = value;
    state.lastSearch = {query: value, shops}; state.searchReturn = false;
    if (isMobile()) { preserveDetailContext(); el.backdrop.hidden = true; filterFields.classList.remove("open"); }
    else { closeInspector(); el.drawer.hidden = true; el.backdrop.hidden = true; state.drawerMode = null; state.drawerBuilding = null; }
    renderResults(value, shops); hideSuggestions(); $("#item-search").blur();
    if (isMobile()) showMobileResults();
    return shops;
  }
  function renderResults(query, shops) {
    if (!query) { el.resultsContent.innerHTML = `<div class="empty-results validation-message"><h2>Enter an item to search</h2><p>Type at least one character, then press Search.</p></div>`; return; }
    const resolvedQuery = window.EnthusiaMarketAdapter.normalizeQuery(query);
    const displayQuery = resolvedQuery.replace(/\b\w/g, value => value.toUpperCase());
    const heading = shops.length ? `${shops.length} result${shops.length === 1 ? "" : "s"} for “${esc(displayQuery)}”` : `No current listings for ${esc(displayQuery)}`;
    el.resultsContent.innerHTML = `<p class="eyebrow">Item results</p><h2>${heading}</h2>${shops.length ? `<div class="result-list">${shops.map((shop, index) => {
      const item = shop.match.item, containerPath = shop.match.containerPath || [], leadingItem = shop.match.contained ? containerPath[0] || shop.match.container : item;
      const inside = shop.match.contained ? `<small class="contained-match">Inside ${containerPath.map(container => esc(publicItemName(container.displayName))).join(" › ") || esc(publicItemName(shop.match.container.displayName))}</small>` : "";
      const presentation = itemPresentation(item);
      const transactionAmount = shop.match.side === "costItem" ? shop.costAmount : shop.sellAmount;
      const primary = shop.match.contained ? `${item.amount}× ${esc(presentation.baseDisplayName)}` : transactionQuantity(transactionAmount, presentation.baseDisplayName, shop.direction, shop.match.side);
      const secondary = presentation.variantSummary ? `<small class="variant-summary" title="${esc(presentation.variantSummary)}">${esc(presentation.variantSummary)}</small>` : "";
      const out = shop.stockCount <= 0;
      return `<article class="result-card${out ? " out-of-stock" : ""}"><button class="result-main" data-result-index="${index}">${itemIcon(leadingItem)}<span><strong>${primary}</strong>${secondary}${inside}${out ? `<strong class="stock-badge">Out of stock</strong>` : ""}<small>${{ SELL: "Selling", BUY: "Buying", TRADE: "Trading" }[shop.direction]} · ${displayStall(shop.stall.id)} · ${buildingNumber(shop.stall.buildingId)} · ${C.floorName(shop.stall.floor)}</small></span></button><div class="result-owner">${ownerVisual(shop.stall.owner)}<span><small>Stall owner</small><strong>${esc(shop.stall.owner.name)}</strong></span></div>${locationMarkup(shop.interaction, true)}</article>`;
    }).join("")}</div>` : `<p class="no-results-copy">Try another item, variant, or material name.</p>`}`;
    el.resultsContent.querySelectorAll("[data-result-index]").forEach(button => button.onclick = () => {
      const shop = shops[Number(button.dataset.resultIndex)], stall = shop.stall;
      state.searchReturn = isMobile(); clearCollapsedContext(); hideMobileResults(); clearFilters(); focusBuilding(stall.buildingId); openStall(stall, null, shop.id); openInspector(shop.id, shop.match.side, shop.match);
    });
    bindCopy(el.resultsContent);
    hydrateOwnerVisuals(el.resultsContent);
  }
  function focusBuilding(id) {
    const building = layout.buildings.find(item => item.id === id), point = px(building.labelPoint), rect = el.viewport.getBoundingClientRect(), scale = Math.max(state.view.scale, 2);
    state.view = { scale, x: rect.width / 2 - point.x * scale, y: rect.height / 2 - point.y * scale }; applyView(); selectMap(id);
  }
  function relativeUpdate(value) {
    if (!value) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "Last updated just now";
    const minutes = Math.floor(seconds / 60);
    return minutes < 60 ? `Last updated ${minutes}m ago` : `Last updated ${Math.floor(minutes / 60)}h ago`;
  }
  function renderConnectionStatus(status = connectionStatus) {
    connectionStatus = status;
    const labels = {live: "Live", connecting: "Connecting", reconnecting: "Reconnecting — showing saved market data", offline: "Offline — showing saved market data", unavailable: "Market data is temporarily unavailable.", fixture: "Local fixture"};
    el.connection.className = `market-connection-status ${status.state}`;
    el.connection.dataset.source = status.source;
    el.connectionLabel.textContent = labels[status.state] || "Connecting";
    el.lastUpdated.textContent = status.source === "api" && status.updatedAt ? ` · ${relativeUpdate(status.updatedAt)}` : "";
    el.connection.title = status.source === "api" ? "Authoritative Market API data" : status.source === "fixture" ? "Local file fixture" : "Authoritative Market API data is unavailable";
  }
  setInterval(() => renderConnectionStatus(), 60000);
  function refreshSearchInPlace() {
    const query = state.lastSearch?.query;
    if (!query) return;
    const shops = adapter.searchItems(query).map((shop, index) => ({shop, index})).sort((left, right) => Number(right.shop.stockCount > 0) - Number(left.shop.stockCount > 0) || left.index - right.index).map(entry => entry.shop);
    state.lastSearch = {query, shops}; renderResults(query, shops);
  }
  function refreshMarketUi(stallId = null) {
    const selectedStall = state.selectedStall, building = state.drawerBuilding, highlightedShop = state.highlightShop;
    const openedFromBuilding = !el.back.hidden;
    const inspector = !el.inspector.hidden && state.inspectorHistory.length ? {shopId: state.inspectorHistory[0].shop.id, stallId: state.inspectorHistory[0].shop.stall.id, side: state.inspectorHistory[0].side} : null;
    const drawerScroll = el.content.scrollTop, inspectorScroll = el.inspectorContent.scrollTop, resultsScroll = el.resultsContent.scrollTop;
    applyFilters(); refreshSearchInPlace();
    if (state.drawerMode === "stall" && selectedStall) {
      const stall = adapter.getStall(selectedStall);
      if (stall) openStall(stall, openedFromBuilding ? building : null, highlightedShop); else closeDrawer();
    } else if (state.drawerMode === "building" && state.drawerBuilding) renderBuildingDrawer();
    if (inspector && (!stallId || inspector.stallId === stallId)) {
      const shop = adapter.getShops().find(candidate => candidate.id === inspector.shopId && candidate.stall.id === inspector.stallId);
      if (shop) openInspector(shop.id, inspector.side); else closeInspector();
    }
    requestAnimationFrame(() => { el.content.scrollTop = drawerScroll; el.inspectorContent.scrollTop = inspectorScroll; el.resultsContent.scrollTop = resultsScroll; });
  }
  let suggestionRevision = 0;
  function showSuggestions(event) {
    const input = $("#item-search");
    if (event?.isComposing) return;
    const revision = ++suggestionRevision, query = input.value;
    queueMicrotask(() => renderSuggestions(query, revision));
  }
  function renderSuggestions(query, revision) {
    const input = $("#item-search");
    if (revision !== suggestionRevision || input.value !== query) return;
    const normalized = query.trim().toLowerCase(), potionQuery = /potion|strength|slow falling|invis|water breathing|night vision|regeneration|poison|weakness|turtle master|wind charged|weaving|oozing|infestation/.test(normalized), items = normalized ? adapter.suggest(query, potionQuery ? 220 : 15) : [];
    state.suggestionIndex = -1; const box = $("#search-suggestions");
    if (!items.length) { box.replaceChildren(); box.hidden = true; return; }
    box.innerHTML = items.map((entry, index) => {
      const label = publicItemName(entry.displayName || entry.searchQuery), query = publicItemName(entry.searchQuery || label), subtitle = publicItemName(entry.subtitle);
      return `<button role="option" data-suggestion="${esc(query)}" data-index="${index}">${itemIcon(entry.item || {material:entry.material,displayName:label,amount:1})}<span><strong>${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</span></button>`;
    }).join(""); box.hidden = false;
    box.querySelectorAll("button").forEach(button => button.onclick = () => { $("#item-search").value = button.dataset.suggestion; executeSearch(); });
  }
  function hideSuggestions() { $("#search-suggestions").hidden = true; state.suggestionIndex = -1; }
  $("#item-search").addEventListener("input", showSuggestions);
  $("#item-search").addEventListener("compositionend", showSuggestions);
  $("#item-search").addEventListener("search", showSuggestions);
  $("#item-search").addEventListener("focus", showSuggestions);
  $("#item-search").onkeydown = event => {
    const buttons = [...$("#search-suggestions").querySelectorAll("button")];
    if (event.key === "ArrowDown" && buttons.length) { event.preventDefault(); state.suggestionIndex = Math.min(buttons.length - 1, state.suggestionIndex + 1); }
    else if (event.key === "ArrowUp" && buttons.length) { event.preventDefault(); state.suggestionIndex = Math.max(0, state.suggestionIndex - 1); }
    else if (event.key === "Enter") { event.preventDefault(); if (state.suggestionIndex >= 0) $("#item-search").value = buttons[state.suggestionIndex].dataset.suggestion; executeSearch(); }
    else if (event.key === "Escape") hideSuggestions();
    buttons.forEach((button, index) => button.classList.toggle("active", index === state.suggestionIndex));
  };
  document.addEventListener("pointerdown", event => {
    if ($("#search-suggestions").hidden) return;
    const path = event.composedPath?.() || [];
    if (!path.includes($("#item-search")) && !path.includes($("#search-button")) && !path.includes($("#search-suggestions"))) hideSuggestions();
  });
  $("#search-button").onclick = () => executeSearch(); $("#drawer-close").onclick = closeDrawer; el.backdrop.onclick = closeDrawer;
  el.back.onclick = () => { closeInspector(); if (state.drawerBuilding) { state.drawerMode = "building"; renderBuildingDrawer(); showDrawer(); } };
  $("#inspector-close").onclick = () => isMobile() ? closeDrawer() : closeInspector();
  $("#zoom-in").onclick = () => zoomAt(1.2, el.viewport.getBoundingClientRect().left + el.viewport.clientWidth / 2, el.viewport.getBoundingClientRect().top + el.viewport.clientHeight / 2);
  $("#zoom-out").onclick = () => zoomAt(.83, el.viewport.getBoundingClientRect().left + el.viewport.clientWidth / 2, el.viewport.getBoundingClientRect().top + el.viewport.clientHeight / 2);
  $("#fit-map").onclick = fit;
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (isMobile() && state.sheet.surface && state.sheet.state !== "collapsed") setSheetState("collapsed");
    else if (isMobile() && state.sheet.state === "collapsed") setSheetState("hidden");
    else if (!el.inspector.hidden) {
      if (state.inspectorHistory.length > 1) { state.inspectorHistory.pop(); renderInspector(); } else closeInspector();
    } else if (!el.drawer.hidden) closeDrawer(); else hideSuggestions();
  });
  window.addEventListener("resize", () => requestAnimationFrame(fit));

  function prefetchSnapshotAssets() {
    if (!snapshot) return;
    const urls = new Set();
    const visit = item => {
      for (const layer of iconDefinition(item)) urls.add(`${assetBase}${layer.src}`);
      for (const entry of item.metadata?.container?.contents || []) visit(entry.item);
    };
    for (const stall of snapshot.stalls) {
      if (ownerHeadUrl(stall.owner)) urls.add(ownerHeadUrl(stall.owner));
      for (const shop of stall.shops) { visit(shop.sellItem); visit(shop.costItem); }
    }
    for (const source of urls) { const image = new Image(); image.decoding = "async"; image.src = source; }
  }
  async function localFixtureSnapshot() {
    if (window.location.protocol !== "file:") return null;
    const response = await fetch(`${assetBase}sample-market-snapshot.json`);
    if (!response.ok) throw new Error("Local Market fixture is unavailable");
    return response.json();
  }
  const marketClient = new window.EnthusiaMarketApi.MarketApiClient({
    expectedStallIds: layout.stalls.map(stall => stall.id),
    fixtureSnapshot: await localFixtureSnapshot(),
    onStatus: renderConnectionStatus,
    onSnapshot(nextSnapshot) { snapshot = nextSnapshot; adapter.replaceSnapshot(nextSnapshot); refreshMarketUi(); prefetchSnapshotAssets(); },
    onStallUpdate(stallId, stall, nextSnapshot) { adapter.replaceStall(stall); snapshot = adapter.snapshot; refreshMarketUi(stallId); }
  });
  snapshot = await marketClient.loadInitialSnapshot();
  if (snapshot) adapter.replaceSnapshot(snapshot);
  window.__MARKET_TEST__ = {
    layout, adapter, marketClient, hitBuilding, screenWorld, openBuilding, openStall, openInspector, closeInspector, closeDrawer,
    executeSearch, applyFilters, clearFilters, focusBuilding, rentState, transactionLabels, itemMetadata, itemIcon,
    minecraftText, drawMinecraftText, canonicalItemRaster, renderShulkerCanvas, matchesRentFilter, showItemTooltip, hideItemTooltip, showMobileResults, hideMobileResults, buildingNumber, refreshMarketUi,
    ownerVisual, ownerHeadUrl, hydrateOwnerVisuals, drawGuildBanner,
    get snapshot() { return snapshot; }, get state() { return state; }, counts: { buildings: layout.buildings.length, stalls: layout.stalls.length }, drawerMode: () => state.drawerMode
  };
  initMap(); applyFilters(); updateViewportMetrics(); requestAnimationFrame(fit);
  marketClient.startLive();
  (window.requestIdleCallback || (callback => setTimeout(callback, 800)))(prefetchSnapshotAssets, {timeout: 4000});
})();
