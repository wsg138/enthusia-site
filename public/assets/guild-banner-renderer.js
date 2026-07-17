(() => {
  "use strict";

  const WIDTH = 20;
  const HEIGHT = 40;
  const FACE_X = 1;
  const FACE_Y = 1;
  const FACE_WIDTH = 20;
  const FACE_HEIGHT = 40;
  const MAX_RENDERED = 96;
  const script = document.currentScript;
  const ASSET_BASE = script?.dataset.bannerAssetBase || new URL("../banner-patterns/", script?.src || location.href).href;
  const DYES = Object.freeze({
    WHITE: "#f9fffe", ORANGE: "#f9801d", MAGENTA: "#c74ebd", LIGHT_BLUE: "#3ab3da",
    YELLOW: "#fed83d", LIME: "#80c71f", PINK: "#f38baa", GRAY: "#474f52",
    LIGHT_GRAY: "#9d9d97", CYAN: "#169c9c", PURPLE: "#8932b8", BLUE: "#3c44aa",
    BROWN: "#835432", GREEN: "#5e7c16", RED: "#b02e26", BLACK: "#1d1d21"
  });
  const ASSETS = Object.freeze({
    SQUARE_BOTTOM_LEFT: "square_bottom_left", SQUARE_BOTTOM_RIGHT: "square_bottom_right", SQUARE_TOP_LEFT: "square_top_left", SQUARE_TOP_RIGHT: "square_top_right",
    STRIPE_BOTTOM: "stripe_bottom", STRIPE_TOP: "stripe_top", STRIPE_LEFT: "stripe_left", STRIPE_RIGHT: "stripe_right", STRIPE_CENTER: "stripe_center", STRIPE_MIDDLE: "stripe_middle",
    STRIPE_DOWNRIGHT: "stripe_downright", STRIPE_DOWNLEFT: "stripe_downleft", STRIPE_SMALL: "small_stripes", CROSS: "cross", STRAIGHT_CROSS: "straight_cross",
    TRIANGLE_BOTTOM: "triangle_bottom", TRIANGLE_TOP: "triangle_top", TRIANGLES_BOTTOM: "triangles_bottom", TRIANGLES_TOP: "triangles_top",
    DIAGONAL_LEFT: "diagonal_left", DIAGONAL_RIGHT: "diagonal_right", DIAGONAL_LEFT_MIRROR: "diagonal_up_left", DIAGONAL_RIGHT_MIRROR: "diagonal_up_right",
    CIRCLE: "circle", RHOMBUS: "rhombus", HALF_VERTICAL: "half_vertical", HALF_HORIZONTAL: "half_horizontal", HALF_VERTICAL_MIRROR: "half_vertical_right", HALF_HORIZONTAL_MIRROR: "half_horizontal_bottom",
    BORDER: "border", CURLY_BORDER: "curly_border", GRADIENT: "gradient", GRADIENT_UP: "gradient_up", BRICKS: "bricks", GLOBE: "globe", CREEPER: "creeper", SKULL: "skull", FLOWER: "flower", MOJANG: "mojang", PIGLIN: "piglin", FLOW: "flow", GUSTER: "guster"
  });
  const ALIASES = Object.freeze({
    SMALL_STRIPES: "STRIPE_SMALL", HALF_VERTICAL_RIGHT: "HALF_VERTICAL_MIRROR", HALF_HORIZONTAL_BOTTOM: "HALF_HORIZONTAL_MIRROR",
    DIAGONAL_UP_LEFT: "DIAGONAL_LEFT_MIRROR", DIAGONAL_UP_RIGHT: "DIAGONAL_RIGHT_MIRROR",
    BASE: "BASE"
  });
  const images = new Map();
  const rendered = new Map();
  const warned = new Set();

  const normal = value => String(value || "").trim().toUpperCase().replace(/^MINECRAFT:/, "").replace(/[\s-]+/g, "_");
  const canvas = () => { const value = document.createElement("canvas"); value.width = WIDTH; value.height = HEIGHT; return value; };
  const developmentWarning = type => {
    if (warned.has(type) || !(/localhost|127\.0\.0\.1/.test(location.hostname) || location.search.includes("bannerDebug=1"))) return;
    warned.add(type); console.warn(`Unknown Minecraft banner pattern skipped: ${type}`);
  };
  function patternType(value) { const type = ALIASES[normal(value)] || normal(value); if (!ASSETS[type]) developmentWarning(type); return ASSETS[type] ? type : null; }
  function dye(value) { return DYES[normal(value)] || DYES.WHITE; }
  function load(name) {
    if (!images.has(name)) images.set(name, new Promise((resolve, reject) => {
      const image = new Image(); image.decoding = "async"; image.onload = () => resolve(image); image.onerror = () => reject(new Error(`banner mask unavailable: ${name}`)); image.src = `${ASSET_BASE}${name}.png`;
    }));
    return images.get(name);
  }
  function tint(image, color) {
    const layer = canvas(), context = layer.getContext("2d"); context.imageSmoothingEnabled = false;
    context.drawImage(image, FACE_X, FACE_Y, FACE_WIDTH, FACE_HEIGHT, 0, 0, WIDTH, HEIGHT);
    context.globalCompositeOperation = "multiply"; context.fillStyle = color; context.fillRect(0, 0, WIDTH, HEIGHT);
    context.globalCompositeOperation = "destination-in"; context.drawImage(image, FACE_X, FACE_Y, FACE_WIDTH, FACE_HEIGHT, 0, 0, WIDTH, HEIGHT);
    return layer;
  }
  function normalized(design) {
    const baseColor = dye(design?.baseColor || design?.base || design?.color);
    const patterns = Array.isArray(design?.patterns) ? design.patterns.slice(0, 6).map(pattern => ({ type: patternType(pattern?.type || pattern?.pattern || pattern?.key), color: dye(pattern?.color || pattern?.dyeColor || pattern?.shade) })).filter(pattern => pattern.type) : [];
    return { baseColor, patterns };
  }
  async function render(design) {
    const definition = normalized(design), key = JSON.stringify(definition);
    if (!rendered.has(key)) rendered.set(key, (async () => {
      const target = canvas(), context = target.getContext("2d"); context.imageSmoothingEnabled = false;
      const layers = [{ name: "base", color: definition.baseColor }, ...definition.patterns.map(pattern => ({ name: ASSETS[pattern.type], color: pattern.color }))];
      for (const layer of layers) context.drawImage(tint(await load(layer.name), layer.color), 0, 0);
      if (rendered.size > MAX_RENDERED) rendered.delete(rendered.keys().next().value);
      return target;
    })());
    return rendered.get(key);
  }
  async function draw(canvasElement, design) {
    const source = await render(design), context = canvasElement.getContext("2d");
    canvasElement.width = WIDTH; canvasElement.height = HEIGHT; context.imageSmoothingEnabled = false; context.clearRect(0, 0, WIDTH, HEIGHT); context.drawImage(source, 0, 0);
    return canvasElement;
  }
  function create(design, label = "Guild banner", className = "guild-banner") {
    const element = canvas(); element.className = className; element.setAttribute("role", "img"); element.setAttribute("aria-label", label); draw(element, design).catch(() => element.remove()); return element;
  }
  window.EnthusiaGuildBannerRenderer = Object.freeze({ create, draw, normalize: normalized, dyes: DYES, aliases: ALIASES, patterns: ASSETS });
})();
