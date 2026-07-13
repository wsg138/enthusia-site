(function () {
  "use strict";

  const normalize = value => String(value ?? "").trim().toLowerCase();
  const materialName = value => normalize(value).replaceAll("_", " ");
  const aliases = new Map([["skulker", "shulker"], ["skulker box", "shulker box"]]);
  const normalizeQuery = value => {
    const normalized = normalize(value);
    return aliases.get(normalized) || normalized.replace(/\bskulker\b/g, "shulker");
  };

  function itemPresentation(item) {
    const metadata = item?.metadata || {};
    const baseDisplayName = item?.material === "ENCHANTED_BOOK" ? "Enchanted Book" : item?.material === "WRITTEN_BOOK" ? "Written Book" : item?.displayName || materialName(item?.material);
    const customDisplayName = metadata.customName && metadata.customName !== baseDisplayName ? metadata.customName : null;
    const variants = [
      ...(metadata.storedEnchantments || []).map(enchantment => `${enchantment.displayName} ${enchantment.level}`),
      ...(metadata.enchantments || []).map(enchantment => `${enchantment.displayName} ${enchantment.level}`),
      metadata.potion?.basePotion, metadata.armorTrim ? `${metadata.armorTrim.material} ${metadata.armorTrim.pattern}` : null,
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
      ...(metadata.enchantments || []).flatMap(enchantment => [enchantment.id, enchantment.displayName, `${enchantment.displayName} ${enchantment.level}`]),
      ...(metadata.storedEnchantments || []).flatMap(enchantment => [enchantment.id, enchantment.displayName, `${enchantment.displayName} ${enchantment.level}`]),
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
      this.variants = variants?.items || [];
      this.suggestionCatalog = [
        ...this.catalog.map(item => ({...item, kind: "MATERIAL", searchQuery: item.displayName, subtitle: null, item: {material: item.material, displayName: item.displayName, amount: 1, metadata: {}}})),
        ...this.variants
      ];
      this.stalls = new Map(snapshot.stalls.map(stall => [stall.id, stall]));
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
      const friendly = normalizeQuery(query), material = friendly.replaceAll(" ", "_");
      if (!friendly) return [];
      const entries = this.searchEntries();
      const exact = entries.filter(entry => itemTerms(entry.match.item).some(term => term === friendly || term === material));
      const selected = exact.length ? exact : friendly.length < 2 ? [] : entries.filter(entry => itemTerms(entry.match.item).some(term => term.startsWith(friendly) || term.startsWith(material) || term.includes(` ${friendly}`) || term.includes(friendly)));
      const seen = new Set();
      return selected.filter(entry => {
        const key = `${entry.id}:${entry.match.side}:${entry.match.item.material}:${entry.match.contained}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    suggest(query, limit = 15) {
      const value = normalizeQuery(query);
      if (value.length < 1) return [];
      const available = new Set(this.searchEntries().flatMap(entry => [normalize(entry.match.item.displayName), normalize(entry.match.item.material)]));
      const materialQuery = value.replaceAll(" ", "_"), matches = this.suggestionCatalog.filter(entry => {
        const terms = [entry.displayName, entry.subtitle, entry.searchQuery, entry.material, entry.id, ...itemTerms(entry.item)].filter(Boolean).map(normalize);
        return terms.some(term => term.startsWith(value) || term.startsWith(materialQuery) || term.includes(` ${value}`));
      });
      const rank = entry => normalize(entry.displayName).startsWith(value) ? 0 : normalize(entry.subtitle).startsWith(value) || normalize(entry.searchQuery).startsWith(value) ? 1 : 2;
      const seen = new Set();
      return matches.sort((a, b) => rank(a) - rank(b) || Number(available.has(normalize(b.displayName)) || available.has(normalize(b.material))) - Number(available.has(normalize(a.displayName)) || available.has(normalize(a.material))) || a.displayName.localeCompare(b.displayName)).filter(entry => {
        const key = `${entry.kind}:${entry.displayName}`; if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, limit);
    }
  }

  window.EnthusiaMarketAdapter = {StaticMarketAdapter, itemTerms, itemPresentation, containerEntries, normalizeQuery};
})();
