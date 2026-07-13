"use strict";

const W = 1672;
const H = 941;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smooth = (value) => value * value * (3 - 2 * value);
const DRAFT_STORAGE_KEY = "enthusia-cinematic-mask-editor-draft-v1";

const sceneCanvas = $("#sceneCanvas");
const sceneCtx = sceneCanvas.getContext("2d", { alpha: false });
const editCanvas = $("#editCanvas");
const editCtx = editCanvas.getContext("2d");
const viewport = $("#viewport");
const stage = $("#stage");
const brushCursor = $("#brushCursor");

const addCanvas = document.createElement("canvas");
const subtractCanvas = document.createElement("canvas");
const suggestionCanvas = document.createElement("canvas");
const finalAlphaCanvas = document.createElement("canvas");
const scratchCanvas = document.createElement("canvas");
const sampleCanvas = document.createElement("canvas");
const strokeCanvas = document.createElement("canvas");
for (const canvas of [addCanvas, subtractCanvas, suggestionCanvas, finalAlphaCanvas, scratchCanvas, sampleCanvas, strokeCanvas]) {
  canvas.width = W;
  canvas.height = H;
}
const addCtx = addCanvas.getContext("2d");
const subtractCtx = subtractCanvas.getContext("2d");
const suggestionCtx = suggestionCanvas.getContext("2d");
const finalAlphaCtx = finalAlphaCanvas.getContext("2d");
const scratchCtx = scratchCanvas.getContext("2d");
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
const strokeCtx = strokeCanvas.getContext("2d", { willReadFrequently: true });
for (const context of [sceneCtx, editCtx, addCtx, subtractCtx, suggestionCtx, finalAlphaCtx, scratchCtx, sampleCtx, strokeCtx]) {
  context.imageSmoothingEnabled = false;
}

const state = {
  session: null,
  images: {},
  baseAlpha: null,
  sourceRgb: null,
  initialAdd: null,
  initialSubtract: null,
  strokes: [],
  redo: [],
  currentStroke: null,
  suggestions: new Map(),
  acceptedSuggestions: new Set(),
  rejectedSuggestions: new Set(),
  currentCheckpoint: 0,
  tool: "terrain",
  brushSize: 4,
  hardness: 1,
  progress: 0.28,
  viewMode: "final",
  glow: true,
  showRepairs: false,
  split: 0.5,
  scale: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  panning: false,
  spaceDown: false,
  panStart: null,
  repairRevision: 0,
  foregroundCache: new Map(),
  dirty: false,
  unresolvedConflicts: new Uint8Array(W * H),
};

const ASSETS = {
  day: "/assets/minecraft-day-valley-v1.png",
  sunset: "/assets/minecraft-sunset-right-v1.png",
  night: "/assets/minecraft-night-valley-v3.png",
  sunrise: "/assets/minecraft-sunrise-left-v1.png",
  mask: "/assets/minecraft-terrain-mask-v1.png",
  baseForeground: "/assets/minecraft-terrain-foreground-v1.png",
  foregroundDay: "/assets/minecraft-terrain-foreground-day-v1.png",
  foregroundSunset: "/assets/minecraft-terrain-foreground-sunset-v1.png",
  foregroundNight: "/assets/minecraft-terrain-foreground-night-v1.png",
  foregroundSunrise: "/assets/minecraft-terrain-foreground-sunrise-v1.png",
};

function loadImage(url, optional = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => optional ? resolve(null) : reject(new Error(`Could not load ${url}`));
    image.src = `${url}?editor=${Date.now()}`;
  });
}

function imageData(image) {
  sampleCtx.clearRect(0, 0, W, H);
  sampleCtx.drawImage(image, 0, 0);
  return sampleCtx.getImageData(0, 0, W, H);
}

function checkpoint() {
  return state.session.checkpoints[state.currentCheckpoint];
}

function setStatus(message, type = "") {
  const element = $("#saveStatus");
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function markDirty() {
  state.dirty = true;
  setStatus("Unsaved repair changes");
  persistDraft();
}

function persistDraft() {
  if (!state.session) return;
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    baseMaskSha256: state.session.baseMaskSha256,
    strokes: state.strokes,
    redo: state.redo,
    acceptedSuggestions: [...state.acceptedSuggestions],
    rejectedSuggestions: [...state.rejectedSuggestions],
    checkpoint: state.currentCheckpoint,
    progress: state.progress,
    savedAt: new Date().toISOString(),
  }));
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw);
    if (draft.baseMaskSha256 !== state.session.baseMaskSha256) return false;
    state.strokes = Array.isArray(draft.strokes) ? draft.strokes : [];
    state.redo = Array.isArray(draft.redo) ? draft.redo : [];
    state.acceptedSuggestions = new Set(Array.isArray(draft.acceptedSuggestions) ? draft.acceptedSuggestions : []);
    state.rejectedSuggestions = new Set(Array.isArray(draft.rejectedSuggestions) ? draft.rejectedSuggestions : []);
    state.currentCheckpoint = clamp(Number(draft.checkpoint) || 0, 0, state.session.checkpoints.length - 1);
    state.progress = clamp(Number(draft.progress) || state.session.checkpoints[state.currentCheckpoint].progress, 0, 1);
    state.dirty = state.strokes.length > 0 || state.acceptedSuggestions.size > 0 || state.rejectedSuggestions.size > 0;
    return state.dirty;
  } catch {
    return false;
  }
}

function phaseAt(progress) {
  if (progress < 0.28) return { from: "day", to: "sunset", amount: smooth(clamp((progress - 0.06) / 0.22, 0, 1)) };
  if (progress < 0.4) return { from: "sunset", to: "night", amount: smooth((progress - 0.28) / 0.12) };
  if (progress < 0.66) return { from: "night", to: "night", amount: 0 };
  if (progress < 0.82) return { from: "night", to: "sunrise", amount: smooth((progress - 0.66) / 0.16) };
  return { from: "sunrise", to: "day", amount: smooth((progress - 0.82) / 0.18) };
}

function cubicPoint(start, controlA, controlB, end, progress) {
  const inverse = 1 - progress;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * progress * controlA.x + 3 * inverse * progress ** 2 * controlB.x + progress ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * progress * controlA.y + 3 * inverse * progress ** 2 * controlB.y + progress ** 3 * end.y,
  };
}

function celestialAt(progress) {
  const logo = { x: 836, y: 188.2 };
  const sunPhase = smooth(clamp(progress / 0.34, 0, 1));
  const sun = cubicPoint(
    logo,
    { x: Math.max(logo.x + 210, W * 0.52), y: Math.max(68, logo.y - 190) },
    { x: W * 0.73, y: H * 0.08 },
    { x: W * 0.88, y: H * 0.69 },
    sunPhase,
  );
  const moonPhase = smooth(clamp((progress - 0.29) / 0.47, 0, 1));
  const moon = cubicPoint(
    { x: W * 0.08, y: H * 0.66 },
    { x: W * 0.24, y: H * 0.06 },
    { x: W * 0.68, y: H * 0.06 },
    { x: W * 0.92, y: H * 0.69 },
    moonPhase,
  );
  return {
    kind: progress <= 0.38 ? "sun" : "moon",
    point: progress <= 0.38 ? sun : moon,
    visible: progress <= 0.38 || (progress >= 0.27 && progress <= 0.78),
  };
}

function drawPhase(ctx, phase) {
  ctx.globalAlpha = 1;
  ctx.drawImage(state.images[phase.from], 0, 0);
  if (phase.from !== phase.to) {
    ctx.globalAlpha = phase.amount;
    ctx.drawImage(state.images[phase.to], 0, 0);
  }
  ctx.globalAlpha = 1;
}

function drawCelestial(ctx, glowEnabled = true) {
  const celestial = celestialAt(state.progress);
  if (!celestial.visible) return;
  const { x, y } = celestial.point;
  ctx.save();
  if (glowEnabled) {
    ctx.shadowBlur = celestial.kind === "sun" ? 75 : 62;
    ctx.shadowColor = celestial.kind === "sun" ? "rgba(255,153,42,.82)" : "rgba(150,185,255,.66)";
  }
  if (celestial.kind === "sun") {
    ctx.fillStyle = "#fff0a7";
    ctx.fillRect(x - 66, y - 66, 132, 132);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffe073";
    ctx.fillRect(x - 56, y - 56, 112, 112);
    ctx.fillStyle = "rgba(255,169,40,.72)";
    ctx.beginPath();ctx.moveTo(x+56,y+56);ctx.lineTo(x+2,y+56);ctx.lineTo(x+56,y+2);ctx.fill();
    ctx.fillStyle = "rgba(255,255,235,.9)";
    ctx.beginPath();ctx.moveTo(x-56,y-56);ctx.lineTo(x-2,y-56);ctx.lineTo(x-56,y-2);ctx.fill();
  } else {
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(x - 66, y - 66, 132, 132);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#e8eef8";
    ctx.fillRect(x - 56, y - 56, 112, 112);
    ctx.fillStyle = "rgba(150,165,192,.55)";
    ctx.fillRect(x - 34, y - 56, 24, 112);
    ctx.fillStyle = "rgba(173,188,210,.6)";
    ctx.fillRect(x - 56, y + 8, 112, 22);
  }
  ctx.restore();
}

function currentRepairData() {
  return {
    add: addCtx.getImageData(0, 0, W, H).data,
    subtract: subtractCtx.getImageData(0, 0, W, H).data,
  };
}

function rebuildRepairs() {
  state.unresolvedConflicts.fill(0);
  addCtx.clearRect(0, 0, W, H);
  subtractCtx.clearRect(0, 0, W, H);
  addCtx.putImageData(state.initialAdd, 0, 0);
  subtractCtx.putImageData(state.initialSubtract, 0, 0);
  for (const id of state.acceptedSuggestions) {
    const suggestion = state.suggestions.get(id);
    if (suggestion) {
      const data = addCtx.getImageData(0, 0, W, H);
      const subtract = subtractCtx.getImageData(0, 0, W, H);
      for (let i = 0; i < suggestion.length; i++) if (suggestion[i]) {
        if (suggestion[i] > data.data[i * 4 + 3]) data.data[i * 4 + 3] = suggestion[i];
        subtract.data[i * 4 + 3] = 0;
      }
      addCtx.putImageData(data, 0, 0);
      subtractCtx.putImageData(subtract, 0, 0);
    }
  }
  for (const stroke of state.strokes) drawStroke(stroke, false);
  state.repairRevision++;
  state.foregroundCache.clear();
  render();
}

function drawBrushPoint(ctx, point, stroke) {
  const radius = Math.max(.5, stroke.size / 2);
  ctx.save();
  ctx.globalCompositeOperation = stroke.composite || (stroke.tool === "edge" ? "copy" : "source-over");
  const alpha = stroke.alpha ?? (stroke.tool === "edge" ? 0.5 : 1);
  if (stroke.hardness >= .995) {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  } else {
    const gradient = ctx.createRadialGradient(point.x, point.y, radius * stroke.hardness, point.x, point.y, radius);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
  }
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintStroke(ctx, stroke) {
  if (stroke.points.length === 1) drawBrushPoint(ctx, stroke.points[0], stroke);
  for (let index = 1; index < stroke.points.length; index++) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, stroke.size * .25)));
    for (let step = 1; step <= steps; step++) {
      drawBrushPoint(ctx, { x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps }, stroke);
    }
  }
}

function clearOppositeLayer(stroke) {
  const opposite = stroke.tool === "sky" ? addCtx : subtractCtx;
  paintStroke(opposite, { ...stroke, tool: "terrain", composite: "destination-out", alpha: 1 });
}

function applyResolution(stroke) {
  const add = addCtx.getImageData(0, 0, W, H);
  const subtract = subtractCtx.getImageData(0, 0, W, H);
  for (const pixel of stroke.pixels) {
    const alpha = pixel.index * 4 + 3;
    if (pixel.winner === "sky") {
      add.data[alpha] = 0;
      subtract.data[alpha] = pixel.value;
    } else {
      subtract.data[alpha] = 0;
      add.data[alpha] = pixel.value;
    }
  }
  addCtx.putImageData(add, 0, 0);
  subtractCtx.putImageData(subtract, 0, 0);
}

function applySuggestionStroke(stroke) {
  const add = addCtx.getImageData(0, 0, W, H);
  const subtract = subtractCtx.getImageData(0, 0, W, H);
  for (const pixel of stroke.pixels) {
    const alpha = pixel.index * 4 + 3;
    add.data[alpha] = Math.max(add.data[alpha], pixel.value);
    subtract.data[alpha] = 0;
  }
  addCtx.putImageData(add, 0, 0);
  subtractCtx.putImageData(subtract, 0, 0);
}

function drawStroke(stroke, refresh = true) {
  if (stroke.tool === "resolution") {
    applyResolution(stroke);
    if (refresh) { state.repairRevision++; state.foregroundCache.clear(); render(); }
    return;
  }
  if (stroke.tool === "suggestion") {
    applySuggestionStroke(stroke);
    if (refresh) { state.repairRevision++; state.foregroundCache.clear(); render(); }
    return;
  }
  const ctx = stroke.tool === "sky" ? subtractCtx : addCtx;
  if (stroke.exclusive) clearOppositeLayer(stroke);
  paintStroke(ctx, stroke);
  if (refresh) {
    state.repairRevision++;
    state.foregroundCache.clear();
    render();
  }
}

function finalAlphaArray() {
  const { add, subtract } = currentRepairData();
  const result = new Uint8ClampedArray(W * H);
  for (let index = 0; index < result.length; index++) {
    result[index] = Math.min(Math.max(state.baseAlpha[index], add[index * 4 + 3]), 255 - subtract[index * 4 + 3]);
  }
  return result;
}

function candidateForeground(phaseName) {
  const key = `${phaseName}:${state.repairRevision}`;
  if (state.foregroundCache.has(key)) return state.foregroundCache.get(key);
  // Reveal the real pixel at this exact scene coordinate. RGB comes directly
  // from the active phase landscape; only alpha comes from the candidate mask.
  const source = imageData(state.images[phaseName]);
  const alpha = finalAlphaArray();
  for (let index = 0; index < alpha.length; index++) source.data[index * 4 + 3] = alpha[index];
  const canvas = document.createElement("canvas");
  canvas.width = W;canvas.height = H;
  canvas.getContext("2d").putImageData(source, 0, 0);
  state.foregroundCache.set(key, canvas);
  return canvas;
}

function drawForeground(ctx, phase, candidate = true) {
  const source = (name) => candidate ? candidateForeground(name) : state.images[`foreground${name[0].toUpperCase()}${name.slice(1)}`];
  ctx.globalAlpha = 1;
  ctx.drawImage(source(phase.from), 0, 0);
  if (phase.from !== phase.to) {
    ctx.globalAlpha = phase.amount;
    ctx.drawImage(source(phase.to), 0, 0);
  }
  ctx.globalAlpha = 1;
}

function drawFinal(ctx, candidate, glowEnabled) {
  const phase = phaseAt(state.progress);
  drawPhase(ctx, phase);
  drawCelestial(ctx, glowEnabled);
  drawForeground(ctx, phase, candidate);
}

function drawMaskOverlay(ctx) {
  const alpha = finalAlphaArray();
  const image = finalAlphaCtx.createImageData(W, H);
  for (let index = 0; index < alpha.length; index++) {
    const offset = index * 4;
    image.data[offset] = 255;image.data[offset + 1] = 0;image.data[offset + 2] = 180;image.data[offset + 3] = Math.round(alpha[index] * .58);
  }
  finalAlphaCtx.putImageData(image, 0, 0);
  ctx.drawImage(finalAlphaCanvas, 0, 0);
}

function drawDiagnosticLayer(ctx, layer, color) {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W, H);
  const source = layer.getContext("2d").getImageData(0, 0, W, H).data;
  const rgb = color.match(/[a-f\d]{2}/gi).map(part => Number.parseInt(part, 16));
  const output = ctx.createImageData(W, H);
  for (let index = 0; index < W * H; index++) {
    const offset = index * 4;
    output.data[offset] = rgb[0];output.data[offset + 1] = rgb[1];output.data[offset + 2] = rgb[2];output.data[offset + 3] = source[offset + 3];
  }
  ctx.putImageData(output, 0, 0);
}

function drawRepairOverlays() {
  editCtx.clearRect(0, 0, W, H);
  if (!state.showRepairs) return;
  const overlay = editCtx.createImageData(W, H);
  const add = addCtx.getImageData(0, 0, W, H).data;
  const subtract = subtractCtx.getImageData(0, 0, W, H).data;
  const suggestion = (!state.acceptedSuggestions.has(checkpoint().id) && !state.rejectedSuggestions.has(checkpoint().id))
    ? state.suggestions.get(checkpoint().id)
    : null;
  for (let i = 0; i < W * H; i++) {
    const offset = i * 4;
    const addAlpha = add[offset + 3];
    const subtractAlpha = subtract[offset + 3];
    if (state.unresolvedConflicts[i]) {
      overlay.data[offset] = 255;overlay.data[offset + 1] = 0;overlay.data[offset + 2] = 255;overlay.data[offset + 3] = 245;
    } else if (subtractAlpha) {
      overlay.data[offset] = 255;overlay.data[offset + 1] = 66;overlay.data[offset + 2] = 58;overlay.data[offset + 3] = Math.round(subtractAlpha * .3);
    } else if (addAlpha) {
      overlay.data[offset] = 92;overlay.data[offset + 1] = 235;overlay.data[offset + 2] = 94;overlay.data[offset + 3] = Math.round(addAlpha * .28);
    } else if (suggestion?.[i]) {
      overlay.data[offset] = 120;overlay.data[offset + 1] = 255;overlay.data[offset + 2] = 45;overlay.data[offset + 3] = 210;
    }
  }
  editCtx.putImageData(overlay, 0, 0);
}

function render() {
  if (!state.baseAlpha) return;
  sceneCtx.clearRect(0, 0, W, H);
  const phase = phaseAt(state.progress);
  switch (state.viewMode) {
    case "landscape": drawPhase(sceneCtx, phase); break;
    case "mask": drawPhase(sceneCtx, phase); drawMaskOverlay(sceneCtx); break;
    case "foreground": {
      sceneCtx.fillStyle = "#171717";sceneCtx.fillRect(0, 0, W, H);
      sceneCtx.fillStyle = "#242424";
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) {
        if (((x + y) / 16) % 2 === 0) sceneCtx.fillRect(x, y, 16, 16);
      }
      drawForeground(sceneCtx, phase, true);
      break;
    }
    case "disk": drawPhase(sceneCtx, phase);drawCelestial(sceneCtx, false);break;
    case "glow": drawPhase(sceneCtx, phase);drawCelestial(sceneCtx, true);break;
    case "add": drawDiagnosticLayer(sceneCtx, addCanvas, "#5ceb5e");break;
    case "subtract": drawDiagnosticLayer(sceneCtx, subtractCanvas, "#ff423a");break;
    case "conflicts": {
      drawFinal(sceneCtx, true, false);
      const conflicts = sceneCtx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) if (state.unresolvedConflicts[i]) {
        const offset = i * 4; conflicts.data[offset] = 255; conflicts.data[offset + 2] = 255; conflicts.data[offset + 3] = 255;
      }
      sceneCtx.putImageData(conflicts, 0, 0);
      break;
    }
    case "split": {
      drawFinal(sceneCtx, false, state.glow);
      scratchCtx.clearRect(0, 0, W, H);drawFinal(scratchCtx, true, state.glow);
      const splitX = Math.round(W * state.split);
      sceneCtx.save();sceneCtx.beginPath();sceneCtx.rect(splitX,0,W-splitX,H);sceneCtx.clip();sceneCtx.drawImage(scratchCanvas,0,0);sceneCtx.restore();
      sceneCtx.fillStyle="#fff";sceneCtx.fillRect(splitX-1,0,2,H);
      break;
    }
    default: drawFinal(sceneCtx, true, state.glow);
  }
  drawRepairOverlays();
  $("#splitControl").hidden = state.viewMode !== "split";
  $("#progressOutput").textContent = state.progress.toFixed(3);
}

function suggestionFor(checkpointData) {
  const result = new Uint8ClampedArray(W * H);
  const radiusX = checkpointData.id.includes("mountain") ? 150 : 95;
  const radiusY = checkpointData.id.includes("mountain") ? 110 : 100;
  const minX = clamp(Math.floor(checkpointData.x - radiusX), 1, W - 2);
  const maxX = clamp(Math.ceil(checkpointData.x + radiusX), 1, W - 2);
  const minY = clamp(Math.floor(checkpointData.y - radiusY), 1, H - 2);
  const maxY = clamp(Math.ceil(checkpointData.y + radiusY), 1, H - 2);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const index = y * W + x;
    const base = state.baseAlpha[index];
    if (base >= 245) continue;
    const neighbors = [index - 1,index + 1,index - W,index + W,index - W - 1,index - W + 1,index + W - 1,index + W + 1];
    const opaque = neighbors.reduce((total, neighbor) => total + (state.baseAlpha[neighbor] >= 245 ? 1 : 0), 0);
    const required = checkpointData.id.includes("mountain") ? 5 : 7;
    if (opaque >= required) result[index] = 255;
  }
  return result;
}

function updateTransform() {
  stage.style.transform = `translate(${state.panX}px,${state.panY}px) scale(${state.scale})`;
  stage.style.setProperty("--editor-scale", state.scale);
  viewport.classList.toggle("pixel-grid", state.scale >= 8);
  $("#zoomOutput").textContent = `${Math.round(state.scale * 100)}%`;
}

function resetView() {
  const rect = viewport.getBoundingClientRect();
  state.scale = Math.min(rect.width / W, rect.height / H) * .96;
  state.panX = (rect.width - W * state.scale) / 2;
  state.panY = (rect.height - H * state.scale) / 2;
  updateTransform();
}

function focusCheckpoint(index) {
  state.currentCheckpoint = (index + state.session.checkpoints.length) % state.session.checkpoints.length;
  const item = checkpoint();
  state.progress = item.progress;
  $("#progressSlider").value = String(item.progress);
  $("#checkpointDescription").textContent = `${item.label} · progress ${item.progress.toFixed(2)}`;
  $$("#checkpointButtons button").forEach((button, i) => button.classList.toggle("active", i === state.currentCheckpoint));
  const rect = viewport.getBoundingClientRect();
  state.scale = item.zoom;
  state.panX = rect.width / 2 - item.x * state.scale;
  state.panY = rect.height / 2 - item.y * state.scale;
  updateTransform();
  render();
}

function scenePoint(event) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: clamp(Math.floor((event.clientX - rect.left - state.panX) / state.scale), 0, W - 1),
    y: clamp(Math.floor((event.clientY - rect.top - state.panY) / state.scale), 0, H - 1),
  };
}

function inspect(point) {
  const index = point.y * W + point.x;
  const { add, subtract } = currentRepairData();
  const addAlpha = add[index * 4 + 3];
  const subtractAlpha = subtract[index * 4 + 3];
  const final = Math.min(Math.max(state.baseAlpha[index], addAlpha), 255 - subtractAlpha);
  const rgbOffset = index * 4;
  $("#inspectCoord").textContent = `${point.x}, ${point.y}`;
  $("#inspectBase").textContent = state.baseAlpha[index];
  $("#inspectAdd").textContent = addAlpha;
  $("#inspectSubtract").textContent = subtractAlpha;
  $("#inspectFinal").textContent = final;
  $("#inspectRgb").textContent = `${state.sourceRgb[rgbOffset]}, ${state.sourceRgb[rgbOffset+1]}, ${state.sourceRgb[rgbOffset+2]}`;
}

function zoomAt(factor, clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const sceneX = (x - state.panX) / state.scale;
  const sceneY = (y - state.panY) / state.scale;
  state.scale = clamp(state.scale * factor, .25, 16);
  state.panX = x - sceneX * state.scale;
  state.panY = y - sceneY * state.scale;
  updateTransform();
}

function buildMetadata() {
  return {
    checkpoints: state.session.checkpoints,
    strokes: state.strokes.map((stroke) => ({
      tool: stroke.tool,
      size: stroke.size,
      hardness: stroke.hardness,
      checkpoint: stroke.checkpoint,
      points: stroke.points,
    })),
    acceptedSuggestions: [...state.acceptedSuggestions],
    progressAtSave: state.progress,
  };
}

function pngData(canvas) {
  return canvas.toDataURL("image/png");
}

function validate() {
  const errors = [];
  const notices = [];
  if (addCanvas.width !== W || addCanvas.height !== H || subtractCanvas.width !== W || subtractCanvas.height !== H) errors.push(`Repair layers must remain ${W}×${H}.`);
  const { add, subtract } = currentRepairData();
  let overlap = 0;
  for (let index = 0; index < W * H; index++) if (add[index*4+3] >= 200 && subtract[index*4+3] >= 200) overlap++;
  if (overlap) errors.push(`${overlap} pixels are strongly marked as both Terrain and Sky.`);
  else notices.push("No strong Terrain/Sky conflicts.");
  notices.push("Both repair layers use original 1672×941 scene coordinates.");
  notices.push("Final alpha is clamped to 0–255 by the deterministic add/subtract formula.");
  notices.push("All phase foregrounds will receive the same candidate alpha.");
  notices.push(`Base-mask session hash: ${state.session.baseMaskSha256.slice(0,16)}…`);
  const list = $("#validationResults");
  list.replaceChildren(...[...errors.map(text => ({text,kind:"error"})),...notices.map(text => ({text,kind:"ok"}))].map(item => {
    const li=document.createElement("li");li.textContent=item.text;li.className=item.kind;return li;
  }));
  setStatus(errors.length ? "Validation needs attention" : "Validation passed", errors.length ? "error" : "success");
  return errors.length === 0;
}

function strokeCoverage(stroke, indices) {
  strokeCtx.clearRect(0, 0, W, H);
  paintStroke(strokeCtx, { ...stroke, tool: "terrain" });
  const data = strokeCtx.getImageData(0, 0, W, H).data;
  const covered = new Set();
  for (const index of indices) if (data[index * 4 + 3] > 0) covered.add(index);
  return covered;
}

function resolveConflicts() {
  const { add, subtract } = currentRepairData();
  const conflicts = [];
  for (let index = 0; index < W * H; index++) {
    if (add[index * 4 + 3] >= 200 && subtract[index * 4 + 3] >= 200) conflicts.push(index);
  }
  state.unresolvedConflicts.fill(0);
  if (!conflicts.length) {
    setStatus("No Terrain/Sky conflicts to resolve", "success");
    validate();
    return;
  }
  const unresolved = new Set(conflicts);
  const winners = new Map();
  for (let i = state.strokes.length - 1; i >= 0 && unresolved.size; i--) {
    const stroke = state.strokes[i];
    if (!stroke.points?.length || stroke.tool === "resolution") continue;
    const covered = strokeCoverage(stroke, unresolved);
    for (const index of covered) {
      winners.set(index, stroke.tool === "sky" ? "sky" : "terrain");
      unresolved.delete(index);
    }
  }
  const pixels = [];
  for (const [index, winner] of winners) {
    const offset = index * 4 + 3;
    pixels.push({ index, winner, value: winner === "sky" ? subtract[offset] : add[offset] });
  }
  if (pixels.length) {
    state.strokes.push({ tool: "resolution", checkpoint: checkpoint().id, pixels });
    state.redo = [];
    rebuildRepairs();
    markDirty();
  }
  for (const index of unresolved) state.unresolvedConflicts[index] = 1;
  render();
  validate();
  setStatus(`${pixels.length} conflicts resolved${unresolved.size ? `; ${unresolved.size} need review` : ""}`, unresolved.size ? "error" : "success");
}

async function save() {
  if (!validate()) return;
  $("#saveBtn").disabled = true;
  setStatus("Saving repairs…");
  try {
    const response = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseMaskSha256: state.session.baseMaskSha256,
        addPng: pngData(addCanvas),
        subtractPng: pngData(subtractCanvas),
        metadata: buildMetadata(),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Save failed.");
    state.dirty = false;
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setStatus("Repairs saved successfully", "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    $("#saveBtn").disabled = false;
  }
}

function download(name, href, type = "image/png") {
  const anchor = document.createElement("a");
  anchor.download = name;
  anchor.href = href;
  anchor.type = type;
  anchor.click();
}

async function confirmAction(title, message) {
  const dialog = $("#confirmDialog");
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true }));
}

function bindEvents() {
  $$(".tool").forEach(button => button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    $$(".tool").forEach(item => item.classList.toggle("active", item === button));
    viewport.style.cursor = state.tool === "pan" ? "grab" : state.tool === "inspect" ? "help" : "crosshair";
  }));
  $("#brushSize").addEventListener("input", event => {state.brushSize=Number(event.target.value);$("#brushSizeOutput").textContent=`${state.brushSize} px`;});
  $$("[data-size]").forEach(button => button.addEventListener("click", () => {state.brushSize=Number(button.dataset.size);$("#brushSize").value=String(state.brushSize);$("#brushSizeOutput").textContent=`${state.brushSize} px`;}));
  $("#hardness").addEventListener("input", event => {state.hardness=Number(event.target.value)/100;$("#hardnessOutput").textContent=`${event.target.value}%`;});
  $("#viewMode").addEventListener("change", event => {state.viewMode=event.target.value;render();});
  $("#progressSlider").addEventListener("input", event => {state.progress=Number(event.target.value);render();});
  $("#glowToggle").addEventListener("change", event => {state.glow=event.target.checked;render();});
  $("#overlayToggle").addEventListener("change", event => {state.showRepairs=event.target.checked;render();});
  $("#splitSlider").addEventListener("input", event => {state.split=Number(event.target.value)/100;$("#splitOutput").textContent=`${event.target.value}%`;render();});
  $("#previousCheckpoint").addEventListener("click", () => focusCheckpoint(state.currentCheckpoint - 1));
  $("#nextCheckpoint").addEventListener("click", () => focusCheckpoint(state.currentCheckpoint + 1));
  $("#zoomInBtn").addEventListener("click", () => {const r=viewport.getBoundingClientRect();zoomAt(1.5,r.left+r.width/2,r.top+r.height/2);});
  $("#zoomOutBtn").addEventListener("click", () => {const r=viewport.getBoundingClientRect();zoomAt(1/1.5,r.left+r.width/2,r.top+r.height/2);});
  $("#resetViewBtn").addEventListener("click", resetView);
  $("#undoBtn").addEventListener("click", () => {const stroke=state.strokes.pop();if(stroke){state.redo.push(stroke);rebuildRepairs();markDirty();}});
  $("#redoBtn").addEventListener("click", () => {const stroke=state.redo.pop();if(stroke){state.strokes.push(stroke);rebuildRepairs();markDirty();}});
  $("#clearStrokeBtn").addEventListener("click", () => {state.currentStroke=null;rebuildRepairs();});
  $("#resetCheckpointBtn").addEventListener("click", async () => {if(await confirmAction("Reset checkpoint",`Remove unsaved edits for ${checkpoint().label}?`)){state.strokes=state.strokes.filter(s=>s.checkpoint!==checkpoint().id);state.acceptedSuggestions.delete(checkpoint().id);state.rejectedSuggestions.delete(checkpoint().id);rebuildRepairs();markDirty();}});
  $("#resetAllBtn").addEventListener("click", async () => {if(await confirmAction("Reset all changes","Remove every unsaved stroke and suggestion decision? Saved repair files remain the starting point.")){state.strokes=[];state.redo=[];state.acceptedSuggestions.clear();state.rejectedSuggestions.clear();rebuildRepairs();markDirty();}});
  $("#acceptSuggestionBtn").addEventListener("click", () => {
    const id=checkpoint().id;
    const suggestion=state.suggestions.get(id);
    const pixels=[];
    if(suggestion)for(let index=0;index<suggestion.length;index++)if(suggestion[index])pixels.push({index,value:suggestion[index]});
    state.acceptedSuggestions.delete(id);
    state.rejectedSuggestions.delete(id);
    if(pixels.length){state.strokes.push({tool:"suggestion",checkpoint:id,pixels,exclusive:true});state.redo=[];}
    rebuildRepairs();markDirty();
  });
  $("#rejectSuggestionBtn").addEventListener("click", () => {state.rejectedSuggestions.add(checkpoint().id);state.acceptedSuggestions.delete(checkpoint().id);rebuildRepairs();markDirty();});
  $("#clearSuggestionsBtn").addEventListener("click", () => {for(const key of state.suggestions.keys())state.suggestions.set(key,new Uint8ClampedArray(W*H));state.acceptedSuggestions.clear();state.rejectedSuggestions.clear();rebuildRepairs();markDirty();});
  $("#validateBtn").addEventListener("click", validate);
  $("#resolveConflictsBtn").addEventListener("click", resolveConflicts);
  $("#reviewConflictsBtn").addEventListener("click", () => {state.viewMode="conflicts";$("#viewMode").value="conflicts";state.showRepairs=true;$("#overlayToggle").checked=true;render();});
  $("#saveBtn").addEventListener("click", save);
  $("#exportAddBtn").addEventListener("click", () => download("minecraft-occlusion-add-v2.png",pngData(addCanvas)));
  $("#exportSubtractBtn").addEventListener("click", () => download("minecraft-occlusion-subtract-v2.png",pngData(subtractCanvas)));
  $("#exportJsonBtn").addEventListener("click", () => download("minecraft-occlusion-repair-v2.json",`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(buildMetadata(),null,2))}`,"application/json"));

  viewport.addEventListener("wheel", event => {event.preventDefault();zoomAt(event.deltaY<0?1.25:.8,event.clientX,event.clientY);},{passive:false});
  viewport.addEventListener("pointerdown", event => {
    viewport.setPointerCapture(event.pointerId);
    const point=scenePoint(event);inspect(point);
    if(state.tool==="inspect")return;
    if(state.tool==="pan"||state.spaceDown){state.panning=true;state.panStart={x:event.clientX,y:event.clientY,panX:state.panX,panY:state.panY};viewport.style.cursor="grabbing";return;}
    state.dragging=true;
    state.currentStroke={tool:state.tool,size:state.tool==="edge"?Math.min(2,state.brushSize):state.brushSize,hardness:state.tool==="edge"?1:state.hardness,checkpoint:checkpoint().id,exclusive:true,points:[point]};
    drawStroke(state.currentStroke);
  });
  viewport.addEventListener("pointermove", event => {
    const point=scenePoint(event);inspect(point);
    brushCursor.style.display=state.tool==="pan"?"none":"block";brushCursor.style.left=`${point.x}px`;brushCursor.style.top=`${point.y}px`;brushCursor.style.width=`${state.brushSize}px`;brushCursor.style.height=`${state.brushSize}px`;
    if(state.panning){state.panX=state.panStart.panX+event.clientX-state.panStart.x;state.panY=state.panStart.panY+event.clientY-state.panStart.y;updateTransform();return;}
    if(!state.dragging||!state.currentStroke)return;
    state.currentStroke.points.push(point);
    drawStroke({...state.currentStroke,points:state.currentStroke.points.slice(-2)});
  });
  const finishPointer=()=>{if(state.panning){state.panning=false;viewport.style.cursor=state.tool==="pan"?"grab":"crosshair";}if(state.dragging&&state.currentStroke){state.strokes.push(state.currentStroke);state.redo=[];state.currentStroke=null;state.dragging=false;rebuildRepairs();markDirty();}};
  viewport.addEventListener("pointerup",finishPointer);viewport.addEventListener("pointercancel",finishPointer);viewport.addEventListener("pointerleave",()=>{brushCursor.style.display="none";});
  window.addEventListener("keydown",event=>{if(event.code==="Space"&&!/INPUT|SELECT|BUTTON/.test(document.activeElement?.tagName)){state.spaceDown=true;event.preventDefault();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();$(event.shiftKey?"#redoBtn":"#undoBtn").click();}});
  window.addEventListener("keyup",event=>{if(event.code==="Space")state.spaceDown=false;});
  window.addEventListener("beforeunload",event=>{if(state.dirty){event.preventDefault();event.returnValue="";}});
  window.addEventListener("resize",()=>{if(state.scale<1)resetView();});
}

async function loadOptionalOverlay(url) {
  const image = await loadImage(url, true);
  if (!image) return new ImageData(W, H);
  return imageData(image);
}

async function init() {
  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    state.session = await response.json();
    if (state.session.missingAssets.length) throw new Error(`Missing assets: ${state.session.missingAssets.join(", ")}`);
    const entries = await Promise.all(Object.entries(ASSETS).map(async ([name,url]) => [name,await loadImage(url)]));
    state.images = Object.fromEntries(entries);
    const maskData = imageData(state.images.mask);
    state.baseAlpha = new Uint8ClampedArray(W*H);
    for(let i=0;i<W*H;i++)state.baseAlpha[i]=maskData.data[i*4+3];
    state.sourceRgb = imageData(state.images.day).data;
    state.initialAdd = state.session.savedRepairs.add ? await loadOptionalOverlay("/assets/minecraft-occlusion-add-v2.png") : new ImageData(W,H);
    state.initialSubtract = state.session.savedRepairs.subtract ? await loadOptionalOverlay("/assets/minecraft-occlusion-subtract-v2.png") : new ImageData(W,H);
    for(const item of state.session.checkpoints)state.suggestions.set(item.id,suggestionFor(item));
    const restoredDraft = restoreDraft();
    const container=$("#checkpointButtons");
    state.session.checkpoints.forEach((item,index)=>{const button=document.createElement("button");button.textContent=item.label;button.addEventListener("click",()=>focusCheckpoint(index));container.append(button);});
    bindEvents();
    rebuildRepairs();
    requestAnimationFrame(()=>focusCheckpoint(state.currentCheckpoint));
    setStatus(restoredDraft ? "Restored unsaved browser draft" : state.session.savedRepairs.add||state.session.savedRepairs.subtract ? "Loaded saved v2 repairs" : "No unsaved strokes");
  } catch (error) {
    setStatus(error.message,"error");
    $("#validationResults").innerHTML=`<li class="error">${error.message}</li>`;
  }
}

init();
