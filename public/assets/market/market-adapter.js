(function () {
  "use strict";

  const normalize = value => String(value ?? "").trim().toLowerCase();
  const materialName = value => normalize(value).replaceAll("_", " ");
  const romanLevel = level => ({1: "I", 2: "II", 3: "III", 4: "IV", 5: "V"})[level] || String(level);
  const exactAliases = new Map([
    ["gap", "golden apple"], ["god apple", "enchanted golden apple"], ["notch apple", "enchanted golden apple"],
    ["enchanted golden apple", "enchanted golden apple"], ["pearl", "ender pearl"], ["enderpearl", "ender pearl"],
    ["skulker", "shulker"], ["skulker box", "shulker box"], ["invis", "invisibility"], ["infestation", "infested"]
  ]);
  const categories = [
    {id: "SWORD", queries: ["sword"], matches: material => /^(WOODEN|STONE|COPPER|GOLDEN|IRON|DIAMOND|NETHERITE)_SWORD$/.test(material)},
    {id: "ARMOR", queries: ["armor"], matches: material => /^(LEATHER|CHAINMAIL|COPPER|GOLDEN|IRON|DIAMOND|NETHERITE)_(HELMET|CHESTPLATE|LEGGINGS|BOOTS)$/.test(material) || material === "TURTLE_HELMET"},
    {id: "WOOD", queries: ["wood"], matches: material => /_(LOG|WOOD|STEM|HYPHAE|PLANKS)$/.test(material)},
    {id: "LOG", queries: ["log", "logs"], matches: material => /_(LOG|WOOD|STEM|HYPHAE)$/.test(material)},
    {id: "PLANK", queries: ["plank", "planks"], matches: material => /_PLANKS$/.test(material)},
    {id: "SHULKER", queries: ["shulker", "shulker box", "skulker", "skulker box"], matches: material => material === "SHULKER_BOX" || /_SHULKER_BOX$/.test(material)}
  ];
  const shulkerColors = ["white", "orange", "magenta", "light blue", "yellow", "lime", "pink", "gray", "light gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
  function querySpec(value) {
    const original = normalize(value).replace(/\bskulker\b/g, "shulker");
    const shulkerColor = shulkerColors.find(color => original === `${color} shulker` || original === `${color} shulker box`);
    if (shulkerColor) return {original, normalized: original, category: null, exactMaterial: `${shulkerColor.replaceAll(" ", "_").toUpperCase()}_SHULKER_BOX`};
    const normalized = exactAliases.get(original) || original;
    return {original, normalized, category: categories.find(category => category.queries.includes(normalized)) || null, exactMaterial: null};
  }
  const normalizeQuery = value => {
    return querySpec(value).normalized;
  };

  function itemPresentation(item) {
    const metadata = item?.metadata || {};
    const armorTrimTemplate = item?.material?.match(/^(.+)_ARMOR_TRIM_SMITHING_TEMPLATE$/);
    const compactTrimName = armorTrimTemplate ? `${armorTrimTemplate[1].split("_").map(word => word[0] + word.slice(1).toLowerCase()).join(" ")} Armor Trim` : null;
    const baseDisplayName = item?.material === "ENCHANTED_BOOK" ? "Enchanted Book" : item?.material === "WRITTEN_BOOK" ? "Written Book" : compactTrimName || item?.displayName || materialName(item?.material);
    const customDisplayName = metadata.customName && metadata.customName !== baseDisplayName ? metadata.customName : null;
    const variants = [
      ...(metadata.storedEnchantments || []).map(enchantment => `${enchantment.displayName} ${romanLevel(enchantment.level)}`),
      ...(metadata.enchantments || []).map(enchantment => `${enchantment.displayName} ${romanLevel(enchantment.level)}`),
      ...(metadata.potion?.effects || []).map(effect => `${effect.name}${effect.amplifier ? ` ${romanLevel(effect.amplifier + 1)}` : ""}${effect.durationSeconds ? ` · ${Math.floor(effect.durationSeconds / 60)}:${String(effect.durationSeconds % 60).padStart(2, "0")}` : ""}`),
      metadata.armorTrim ? `${metadata.armorTrim.material} ${metadata.armorTrim.pattern}` : null,
      metadata.smithingTemplate?.type, metadata.goatHornInstrument, metadata.writtenBook?.title,
      metadata.shulkerColor ? `${metadata.shulkerColor} Shulker Box` : null, metadata.publicVariantId
    ].filter(Boolean);
    return {baseDisplayName, customDisplayName, variantSummary: variants.join(" · "), searchableTerms: itemTerms(item)};
  }

  function itemTerms(item) {
    if (!item) return [];
    const metadata = item.metadata || {};
    return [
      item.material, materialName(item.material), item.displayName, metadata.customName,
      ...(metadata.enchantments || []).flatMap(enchantment => [enchantment.id, enchantment.displayName, `${enchantment.displayName} ${enchantment.level}`, `${enchantment.displayName} ${romanLevel(enchantment.level)}`]),
      ...(metadata.storedEnchantments || []).flatMap(enchantment => [enchantment.id, enchantment.displayName, `${enchantment.displayName} ${enchantment.level}`, `${enchantment.displayName} ${romanLevel(enchantment.level)}`]),
      metadata.armorTrim?.pattern, metadata.armorTrim?.material,
      metadata.potion?.basePotion, ...(metadata.potion?.effects || []).map(effect => effect.name),
      metadata.smithingTemplate?.type, metadata.shulkerColor,
      metadata.writtenBook?.title, metadata.writtenBook?.author, metadata.goatHornInstrument,
      ...(metadata.fireworkEffects || []).flatMap(effect => [effect.type, effect.description]),
      ...(metadata.bannerPatterns || []).flatMap(pattern => [pattern.pattern, pattern.color]),
      metadata.publicVariantId
    ].filter(Boolean).map(normalize);
  }

  function containerEntries(item, side, container = null, path = [], depth = 0, ancestors = new Set(), containerPath = []) {
    const direct = [{item, side, container, contained: Boolean(container), path, depth, containerPath}];
    if (!item || depth >= 4 || ancestors.has(item)) return direct;
    const contents = item?.metadata?.container?.contents || [];
    const nextAncestors = new Set(ancestors).add(item);
    return direct.concat(contents.flatMap((entry, index) => containerEntries(entry.item, side, item, [...path, {index, slot: entry.slot ?? null}], depth + 1, nextAncestors, [...containerPath, item])));
  }

  class StaticMarketAdapter {
    constructor(layout, snapshot, catalog = window.ENTHUSIA_MINECRAFT_ITEM_CATALOG, variants = window.ENTHUSIA_MINECRAFT_ITEM_VARIANTS) {
      this.layout = layout;
      this.snapshot = snapshot;
      this.catalog = catalog?.items || [];
      this.variants = (variants?.items || []).map(entry => {
        if (entry.kind === "ENCHANTMENT") return {...entry, displayName: "Enchanted Book"};
        if (entry.kind === "POTION") {
          const [primary, duration] = entry.displayName.split(" — ");
          return {...entry, displayName: primary, subtitle: duration || entry.subtitle?.replace(/^.*? — /, "") || null};
        }
        return entry;
      });
      this.suggestionCatalog = [
        ...this.catalog.map(item => { const publicItem = {material: item.material, displayName: item.displayName, amount: 1, metadata: {}}; return {...item, displayName: itemPresentation(publicItem).baseDisplayName, kind: "MATERIAL", searchQuery: item.displayName, subtitle: null, item: publicItem}; }),
        ...this.variants
      ];
      this.stalls = new Map(snapshot.stalls.map(stall => [stall.id, stall]));
    }
    replaceSnapshot(snapshot) {
      this.snapshot = snapshot;
      this.stalls = new Map(snapshot.stalls.map(stall => [stall.id, stall]));
    }
    replaceStall(stall) {
      const index = this.snapshot.stalls.findIndex(candidate => candidate.id === stall.id);
      if (index < 0) return false;
      const stalls = [...this.snapshot.stalls]; stalls[index] = stall;
      this.snapshot = {...this.snapshot, stalls}; this.stalls.set(stall.id, stall); return true;
    }
    getStall(id) { return this.stalls.get(id) || null; }
    getBuilding(id) { return this.layout.buildings.find(building => building.id === id) || null; }
    getShops() {
      return this.snapshot.stalls.flatMap(stall => stall.shops.filter(shop => shop.searchable !== false).map(shop => ({...shop, stall})));
    }
    searchEntries() {
      return this.getShops().flatMap(shop => [
        ...containerEntries(shop.sellItem, "sellItem"),
        ...containerEntries(shop.costItem, "costItem")
      ].map(match => ({...shop, match})));
    }
    searchItems(query) {
      const spec = querySpec(query), friendly = spec.normalized, material = friendly.replaceAll(" ", "_");
      if (!friendly) return [];
      const entries = this.searchEntries();
      const categoryMatches = spec.category ? entries.filter(entry => spec.category.matches(entry.match.item.material)) : [];
      const exact = spec.exactMaterial ? entries.filter(entry => entry.match.item.material === spec.exactMaterial) : spec.category ? categoryMatches : entries.filter(entry => itemTerms(entry.match.item).some(term => term === friendly || term === material));
      const selected = spec.exactMaterial || spec.category ? exact : exact.length ? exact : friendly.length < 2 ? [] : entries.filter(entry => itemTerms(entry.match.item).some(term => term.startsWith(friendly) || term.startsWith(material) || term.includes(` ${friendly}`) || term.includes(friendly)));
      const seen = new Set();
      return selected.filter(entry => {
        const key = `${entry.id}:${entry.match.side}:${entry.match.item.material}:${entry.match.contained}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    suggest(query, limit = 15) {
      const spec = querySpec(query), value = spec.normalized;
      if (value.length < 1) return [];
      const available = new Set(this.searchEntries().flatMap(entry => [normalize(entry.match.item.displayName), normalize(entry.match.item.material)]));
      const materialQuery = value.replaceAll(" ", "_"), matches = this.suggestionCatalog.filter(entry => {
        if (spec.exactMaterial) return (entry.material || entry.item?.material) === spec.exactMaterial;
        if (spec.category) return spec.category.matches(entry.material || entry.item?.material);
        const terms = [entry.displayName, entry.subtitle, entry.searchQuery, entry.material, entry.id, ...itemTerms(entry.item)].filter(Boolean).map(normalize);
        return terms.some(term => term.startsWith(value) || term.startsWith(materialQuery) || term.includes(` ${value}`));
      });
      const rank = entry => normalize(entry.displayName).startsWith(value) ? 0 : normalize(entry.subtitle).startsWith(value) || normalize(entry.searchQuery).startsWith(value) ? 1 : 2;
      const seen = new Set();
      return matches.sort((a, b) => rank(a) - rank(b) || Number(available.has(normalize(b.displayName)) || available.has(normalize(b.material))) - Number(available.has(normalize(a.displayName)) || available.has(normalize(a.material))) || a.displayName.localeCompare(b.displayName)).filter(entry => {
        const key = `${entry.kind}:${entry.displayName}:${entry.subtitle || ""}`; if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, limit);
    }
  }

  window.EnthusiaMarketAdapter = {StaticMarketAdapter, itemTerms, itemPresentation, containerEntries, normalizeQuery, querySpec, categories};
})();
